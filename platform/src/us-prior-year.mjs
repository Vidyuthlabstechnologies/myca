import { form1040Amount } from './us-line-map.mjs';
import { computeForm1040, SUPPORTED_YEARS } from './us-1040.mjs';
import { engineInput, usReturnRecord } from './us-return.mjs';
import { openTin, sealTin } from './us-identity.mjs';
import { appendAuditEvent } from './ca-api.mjs';
import { documentsOf, isSha256 } from './document-store.mjs';
import { readUsPriorYearPdf } from './us-prior-year-pdf.mjs';

const MAX_AMOUNT = 1e11;
const FIGURES = Object.freeze({
  agi: { answer: 'priorYearAgi', label: 'Last year\'s adjusted gross income (Form 1040 line 11)' },
  totalTax: { answer: 'priorYearTax', label: 'Last year\'s total tax (Form 1040 line 24)' },
  overpaymentApplied: { answer: 'priorYearOverpaymentApplied', label: 'Refund applied to this year (Form 1040 line 36)' },
  shortTermLossCarryover: { answer: 'shortTermLossCarryover', label: 'Short-term capital loss carryover' },
  longTermLossCarryover: { answer: 'longTermLossCarryover', label: 'Long-term capital loss carryover' },
  qbiLossCarryforward: { answer: 'qbiLossCarryforward', label: 'Qualified business loss carryforward (Form 8995 line 16, line 18 from 2026)' },
  qbiReitPtpLossCarryforward: { answer: 'qbiReitPtpLossCarryforward', label: 'REIT and PTP loss carryforward (Form 8995 line 17, line 19 from 2026)' },
  iraBasis: { answer: 'priorIraBasis', label: 'Basis in traditional IRAs (Form 8606 line 14)' },
});

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function reseal(person, fromScope, toScope) {
  if (!person) return null;
  const copy = { ...person };
  if (person.tin && fromScope !== toScope) {
    const raw = openTin(person.tin.sealed, { scope: fromScope });
    copy.tin = sealTin(raw, { scope: toScope });
  }
  return copy;
}

const PDF_ERRORS = Object.freeze({
  NOT_A_PDF: 'The file is not a PDF. Upload the PDF of last year\'s Form 1040.',
  PDF_ENCRYPTED: 'The PDF is protected with a kind of encryption MyCA cannot open. Save or print it again without a password and upload that copy.',
  PDF_PASSWORD_REQUIRED: 'The PDF needs a password to open. Save or print it again without a password and upload that copy.',
  PDF_TOO_LARGE: 'The PDF is too large to read. Upload only the Form 1040 and Schedule D pages.',
  PDF_TOO_MANY_OBJECTS: 'The PDF is too large to read. Upload only the Form 1040 and Schedule D pages.',
  PDF_TIMEOUT: 'The PDF took too long to read. Upload only the Form 1040 and Schedule D pages.',
  PDF_UNREADABLE: 'The PDF could not be read. Type the figures from last year\'s Form 1040 instead.',
});

function lastName(person) {
  return String(person?.lastName || '').trim().toLowerCase();
}

function identityWarnings(read, taxYear, priorYear, people) {
  const warnings = [];
  if (!read.taxYear) warnings.push(`The tax year could not be read from the PDF; check it is your ${priorYear} return.`);
  else if (read.taxYear !== priorYear) warnings.push(`This PDF is a ${read.taxYear} Form 1040, but the ${taxYear} return needs figures from ${priorYear}.`);
  const known = people.filter(Boolean);
  const fours = known.map((person) => person.tin?.last4).filter(Boolean);
  if (read.filer.ssnLast4 && fours.length && !fours.includes(read.filer.ssnLast4)) warnings.push(`The SSN on the PDF ends in ${read.filer.ssnLast4}, which does not match the SSN on this return.`);
  const surnames = known.map(lastName).filter(Boolean);
  const pdfName = String(read.filer.lastName || read.filer.name || '').toLowerCase();
  if (pdfName && surnames.length && !surnames.some((surname) => pdfName.includes(surname))) warnings.push(`The name on the PDF (${read.filer.name || read.filer.lastName}) does not match the name on this return.`);
  return warnings;
}

function pdfFigures(state, args, taxYear, priorYear, people) {
  const sha = String(args.documentSha256 || '').trim().toLowerCase();
  if (!isSha256(sha)) return fail('INVALID_SHA256', { hint: 'Upload last year\'s Form 1040 PDF with /api/upload first and pass its documentSha256.' });
  const stored = documentsOf(state).readVerified(sha);
  if (!stored.ok) return fail(stored.error);
  const read = readUsPriorYearPdf(stored.content, { priorYear });
  if (!read.ok) return fail(read.error, { hint: read.hint || PDF_ERRORS[read.error] || PDF_ERRORS.PDF_UNREADABLE });
  const figures = {};
  for (const [key, item] of Object.entries(read.figures)) if (Object.hasOwn(FIGURES, key)) figures[key] = Math.round(item.value * 100) / 100;
  return {
    ok: true,
    figures,
    pdf: {
      documentSha256: sha,
      taxYear: read.taxYear,
      filerName: read.filer.name,
      ssnLast4: read.filer.ssnLast4,
      found: Object.fromEntries(Object.entries(read.figures).filter(([key]) => Object.hasOwn(FIGURES, key)).map(([key, item]) => [key, { value: figures[key], where: item.where, confidence: item.confidence }])),
      warnings: [...identityWarnings(read, taxYear, priorYear, people), ...read.warnings],
      notes: read.notes,
    },
  };
}

function confidenceWord(confidence) {
  return confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';
}

function pdfSummary(pdf) {
  return { taxYear: pdf.taxYear || '', filerName: pdf.filerName || '', ssnLast4: pdf.ssnLast4 || '', found: pdf.found, warnings: pdf.warnings };
}

function typedFigures(figures, problems) {
  const out = {};
  if (figures === undefined || figures === null) return out;
  if (typeof figures !== 'object' || Array.isArray(figures)) {
    problems.push('Figures are amounts from last year\'s Form 1040.');
    return out;
  }
  if (Object.keys(figures).some((key) => !Object.hasOwn(FIGURES, key))) problems.push(`Figures can be ${Object.keys(FIGURES).join(', ')}.`);
  for (const [name, spec] of Object.entries(FIGURES)) {
    const raw = Object.hasOwn(figures, name) ? figures[name] : undefined;
    if (raw === '' || raw === null || raw === undefined) continue;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) {
      problems.push(`${spec.label} is an amount of zero or more.`);
      continue;
    }
    out[name] = Math.round(number * 100) / 100;
  }
  return out;
}

export function planUsPriorYearImport(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim();
  if (!SUPPORTED_YEARS.includes(taxYear)) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const priorYear = String(Number(taxYear) - 1);
  const problems = [];
  const typed = typedFigures(args.figures, problems);
  if (problems.length) return fail('US_PRIOR_YEAR_INVALID', { problems });
  const prior = SUPPORTED_YEARS.includes(priorYear) ? usReturnRecord(state, priorYear) : null;
  const target = usReturnRecord(state, taxYear);
  const figures = {};
  const expectedForms = [];
  const notes = [];
  let source = 'figures';
  let pdf = null;
  let fromPdf = {};
  if (args.documentSha256 !== undefined && args.documentSha256 !== null && args.documentSha256 !== '') {
    const read = pdfFigures(state, args, taxYear, priorYear, [target?.taxpayer, target?.spouse, prior?.taxpayer, prior?.spouse]);
    if (!read.ok) return read;
    pdf = read.pdf;
    fromPdf = read.figures;
    if (!Object.keys(fromPdf).length && !Object.keys(typed).length) return fail('US_PRIOR_YEAR_PDF_NOTHING_READ', { hint: `No figure was found in the PDF. Type the figures from last year's Form 1040: ${Object.keys(FIGURES).join(', ')}.`, warnings: pdf.warnings, notes: pdf.notes });
  }
  if (prior && prior.filingStatus) {
    const result = computeForm1040(engineInput(state, prior), priorYear);
    if (result.ok) {
      source = 'myca';
      const d = result.data;
      figures.agi = d.summary.agi;
      figures.totalTax = d.summary.totalTax;
      const applied = form1040Amount(d, 'appliedToNextYear');
      if (applied > 0) figures.overpaymentApplied = applied;
      const carry = d.capitalLossCarryover || { shortTerm: 0, longTerm: 0 };
      if (carry.shortTerm > 0) figures.shortTermLossCarryover = carry.shortTerm;
      if (carry.longTerm > 0) figures.longTermLossCarryover = carry.longTerm;
      if (d.qbiCarryforward?.qbiLoss > 0) figures.qbiLossCarryforward = d.qbiCarryforward.qbiLoss;
      if (d.qbiCarryforward?.reitPtpLoss > 0) figures.qbiReitPtpLossCarryforward = d.qbiCarryforward.reitPtpLoss;
      const iraBasis = Number(d.retirementCarryforward?.iraBasis || 0);
      if (iraBasis > 0) figures.iraBasis = iraBasis;
      if (d.summary.itemized) notes.push(`You itemized in ${priorYear}: a state tax refund received in ${taxYear} can be taxable.`);
      const seen = new Set();
      for (const form of prior.forms || []) {
        const key = `${form.kind}|${form.payer || ''}|${form.owner || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        expectedForms.push({ kind: form.kind, payer: form.payer || '', owner: form.owner || 'taxpayer' });
      }
    }
  }
  if (pdf && Object.keys(fromPdf).length) {
    if (source === 'figures') source = 'pdf';
    Object.assign(figures, fromPdf);
  }
  if (pdf) notes.push(...pdf.notes);
  Object.assign(figures, typed);
  if (source === 'figures' && !Object.keys(figures).length) return fail('US_PRIOR_YEAR_NOTHING', { hint: `There is no ${priorYear} return in MyCA. Give the figures from last year's Form 1040: ${Object.keys(FIGURES).join(', ')}.` });
  const answers = {};
  const kept = [];
  for (const [key, value] of Object.entries(figures)) {
    const id = FIGURES[key].answer;
    if (target && Object.hasOwn(target.answers || {}, id) && args.overwrite !== true && target.answers[id] !== value) {
      kept.push(id);
      continue;
    }
    answers[id] = value;
  }
  const copyProfile = source === 'myca' && args.copyProfile !== false && !(target && target.filingStatus);
  return { ok: true, taxYear, priorYear, source, answers, kept, copyProfile, expectedForms, notes, prior, pdf, typed };
}

export function importUsPriorYear(state, args = {}) {
  const plan = planUsPriorYearImport(state, args);
  if (!plan.ok) return plan;
  const prior = plan.prior;
  const ret = usReturnRecord(state, plan.taxYear, { create: true, scopeId: plan.copyProfile ? prior.scopeId : '' });
  if (plan.copyProfile) {
    try {
      const scope = (who) => [`${prior.scopeId}:${who}`, `${ret.scopeId}:${who}`];
      const taxpayer = reseal(prior.taxpayer, ...scope('taxpayer'));
      const spouse = reseal(prior.spouse, ...scope('spouse'));
      const dependents = (prior.dependents || []).map((item) => reseal(item, ...scope(`dependent-${item.id}`)));
      Object.assign(ret, { filingStatus: prior.filingStatus, taxpayer, spouse, dependents, address: prior.address ? { ...prior.address } : null, nextDependentNumber: prior.nextDependentNumber || dependents.length + 1 });
    } catch (err) {
      return fail(err?.code || 'TIN_UNREADABLE', { hint: 'The saved SSNs could not be read, so the profile was not copied. Enter it again.' });
    }
  }
  Object.assign(ret.answers, plan.answers);
  ret.updatedAt = new Date().toISOString();
  appendAuditEvent(state, { actorId: state.__actor?.userId || 'owner', action: 'us_prior_year_imported', metadata: { taxYear: plan.taxYear, priorYear: plan.priorYear, source: plan.source, answers: Object.keys(plan.answers), profileCopied: plan.copyProfile, ...(plan.pdf ? { documentSha256: plan.pdf.documentSha256, pdfTaxYear: plan.pdf.taxYear || '', readFromPdf: Object.keys(plan.pdf.found), typedOverPdf: Object.keys(plan.typed).filter((key) => Object.hasOwn(plan.pdf.found, key)) } : {}) } });
  return {
    ok: true,
    data: {
      taxYear: plan.taxYear,
      priorYear: plan.priorYear,
      source: plan.source,
      profileCopied: plan.copyProfile,
      answers: plan.answers,
      keptYourAnswers: plan.kept,
      expectedForms: plan.expectedForms,
      ...(plan.pdf ? { pdf: pdfSummary(plan.pdf) } : {}),
      notes: [...plan.notes, ...(plan.copyProfile ? ['Check the filing status, address and each dependent\'s age: they were copied from last year.'] : [])],
    },
  };
}

export function usPriorYearPreview(state, args) {
  const plan = planUsPriorYearImport(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.hint || plan.error], summary: '', effects: [], figures: {} };
  const dollars = (value) => `$${Number(value).toLocaleString('en-US')}`;
  const effects = Object.entries(FIGURES).filter(([, spec]) => Object.hasOwn(plan.answers, spec.answer)).map(([key, spec]) => {
    const read = plan.pdf && plan.pdf.found[key] && !Object.hasOwn(plan.typed, key) ? plan.pdf.found[key] : null;
    return `${spec.label}: ${dollars(plan.answers[spec.answer])}${read ? ` (read from the PDF: ${read.where}; ${confidenceWord(read.confidence)} confidence)` : ''}`;
  });
  if (plan.pdf) {
    const who = [plan.pdf.filerName, plan.pdf.ssnLast4 ? `SSN ending ${plan.pdf.ssnLast4}` : ''].filter(Boolean).join(', ');
    effects.unshift(`Read ${plan.pdf.taxYear ? `a ${plan.pdf.taxYear} ` : 'a '}Form 1040 PDF${who ? ` for ${who}` : ''}. Check each figure against the PDF before you confirm.`);
    for (const warning of plan.pdf.warnings) effects.push(`Check: ${warning}`);
    for (const note of plan.pdf.notes) effects.push(note);
  }
  if (plan.copyProfile) effects.push('Filing status, names, sealed SSNs, dependents and address are copied from last year.');
  if (plan.kept.length) effects.push('Answers you already gave are kept.');
  if (plan.expectedForms.length) effects.push(`${plan.expectedForms.length} tax form${plan.expectedForms.length === 1 ? '' : 's'} to expect again from last year's payers.`);
  const from = plan.source === 'myca' ? ' from your MyCA return' : plan.source === 'pdf' ? ' from last year\'s Form 1040 PDF' : ' from the figures given';
  return { blockers: [], summary: `Bring ${plan.priorYear} into the ${plan.taxYear} return${from}.`, effects, figures: { taxYear: plan.taxYear, priorYear: plan.priorYear, source: plan.source, ...(plan.pdf ? { pdfTaxYear: plan.pdf.taxYear || '', ssnLast4: plan.pdf.ssnLast4 || '' } : {}) } };
}

export function usPriorYearWords(data) {
  const parts = [`Brought ${data.priorYear} into your ${data.taxYear} return${data.source === 'pdf' ? ' from last year\'s Form 1040 PDF' : ''}`];
  if (data.profileCopied) parts.push('copied your profile and dependents');
  const count = Object.keys(data.answers).length;
  if (count) parts.push(`filled ${count} answer${count === 1 ? '' : 's'}`);
  const tail = data.expectedForms.length ? ` Expect ${data.expectedForms.length} form${data.expectedForms.length === 1 ? '' : 's'} again: ${data.expectedForms.slice(0, 5).map((form) => `${form.kind}${form.payer ? ` from ${form.payer}` : ''}`).join(', ')}.` : '';
  const checks = data.pdf && data.pdf.warnings.length ? ` Check: ${data.pdf.warnings.join(' ')}` : '';
  return `${parts.join(', ')}.${tail}${data.notes.length ? ` ${data.notes.join(' ')}` : ''}${checks}`;
}
