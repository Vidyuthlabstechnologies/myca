import { readPdf } from './pdf-read.mjs';

export const IRS_1040_FIELDS = Object.freeze({
  2024: Object.freeze({
    f1040: Object.freeze({
      firstName: 'Page1[0].f1_04[0]',
      lastName: 'Page1[0].f1_05[0]',
      ssn: 'Page1[0].f1_06[0]',
      spouseSsn: 'Page1[0].f1_09[0]',
      line7: 'Page1[0].Line4a-11_ReadOrder[0].f1_52[0]',
      agi: 'Page1[0].Line4a-11_ReadOrder[0].f1_56[0]',
      line14: 'Page1[0].f1_59[0]',
      totalTax: 'Page2[0].f2_10[0]',
      overpaymentApplied: 'Page2[0].f2_27[0]',
    }),
    scheduleD: Object.freeze({
      sd7: 'Page1[0].f1_22[0]',
      sd15: 'Page1[0].f1_43[0]',
      sd16: 'Page2[0].f2_01[0]',
      sd21: 'Page2[0].TagCorrectingSubform[0].f2_04[0]',
    }),
  }),
  2025: Object.freeze({
    f1040: Object.freeze({
      firstName: 'Page1[0].f1_14[0]',
      lastName: 'Page1[0].f1_15[0]',
      ssn: 'Page1[0].f1_16[0]',
      spouseSsn: 'Page1[0].f1_19[0]',
      line7: 'Page1[0].f1_70[0]',
      agi: 'Page1[0].f1_75[0]',
      line14: 'Page2[0].f2_05[0]',
      totalTax: 'Page2[0].f2_16[0]',
      overpaymentApplied: 'Page2[0].f2_34[0]',
    }),
    scheduleD: Object.freeze({
      sd7: 'Page1[0].f1_22[0]',
      sd15: 'Page1[0].f1_43[0]',
      sd16: 'Page2[0].f2_1[0]',
      sd21: 'Page2[0].f2_4[0]',
    }),
  }),
});

const TARGETS = Object.freeze({
  f1040: Object.freeze({
    agi: { markers: ['11', '11a', '11b'], context: /adjusted gross income/i, line: 'Form 1040 line 11' },
    line14: { markers: ['14'], context: /\b14 Add lines 12/i, line: 'Form 1040 line 14' },
    totalTax: { markers: ['24'], context: /this is your total tax/i, line: 'Form 1040 line 24' },
    overpaymentApplied: { markers: ['36'], context: /applied to your (?:20\d\d )?estimated tax/i, line: 'Form 1040 line 36' },
    line7: { markers: ['7', '7a'], context: /capital gain or \(loss\)/i, line: 'Form 1040 line 7' },
  }),
  scheduleD: Object.freeze({
    sd7: { markers: ['7'], context: /net short-term capital gain or \(loss\)/i, line: 'Schedule D line 7' },
    sd15: { markers: ['15'], context: /net long-term capital gain or \(loss\)/i, line: 'Schedule D line 15' },
    sd16: { markers: ['16'], context: /combine lines 7 and 15/i, line: 'Schedule D line 16' },
    sd21: { markers: ['21'], context: /loss on line 16|smaller of|\(\$3,000\)/i, line: 'Schedule D line 21' },
  }),
  worksheet: Object.freeze({
    shortTermLossCarryover: { markers: ['8'], context: /short-term capital loss carry(?:over|forward) (?:for|to) (20\d\d)/i, line: 'Capital Loss Carryover Worksheet line 8', year: true },
    longTermLossCarryover: { markers: ['13'], context: /long-term capital loss carry(?:over|forward) (?:for|to) (20\d\d)/i, line: 'Capital Loss Carryover Worksheet line 13', year: true },
  }),
});

const AMOUNT = /^\(?\s*-?\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?\s*\)?$/;
const AMOUNT_TOKEN = /\(\s*\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?\s*\)|-?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?/g;
const MAX_AMOUNT = 1e11;

export function parseAmount(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text || !AMOUNT.test(text)) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  const number = Number(text.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(number) || number > MAX_AMOUNT) return null;
  const value = Math.round(number * 100) / 100;
  return negative && value ? -value : value;
}

const compact = (text) => text.replace(/\s+/g, '');
const normalise = (text) => text.replace(/(^|\s)(\d{1,2}) ([a-z])(?=\s)/g, '$1$2$3').replace(/\s+/g, ' ').trim();

function classify(page) {
  const all = page.lines.map((line) => line.text).join('\n');
  const tight = compact(all);
  const kinds = [];
  let year = null;
  const yearOf = (pattern) => {
    const match = pattern.exec(tight);
    return match ? match[1] : null;
  };
  if ((/SCHEDULE ?D\b/.test(all) && /CapitalGainsandLosses/i.test(tight)) || /ScheduleD\(Form1040(?:-SR)?\)20\d\dPage2/i.test(tight)) {
    kinds.push('scheduleD');
    year = yearOf(/ScheduleD\(Form1040(?:-SR)?\)(20\d\d)/i) || yearOf(/1040-NR\.?(20\d\d)/);
  }
  if (/Form1040(?:-SR)?(?:\(20\d\d\)Page2|U\.S\.IndividualIncomeTaxReturn|\(20\d\d\))/i.test(tight) && /adjustedgrossincome|thisisyourtotaltax/i.test(tight) && !kinds.includes('scheduleD')) {
    kinds.push('f1040');
    year = yearOf(/IndividualIncomeTaxReturn(?:forSeniors)?(20\d\d)/i) || yearOf(/Form1040(?:-SR)?\((20\d\d)\)/i);
    if (!year) {
      const applied = /appliedtoyour(20\d\d)estimatedtax/i.exec(tight);
      if (applied) year = String(Number(applied[1]) - 1);
    }
  }
  if (/CapitalLossCarry(?:over|forward)Worksheet/i.test(tight) || /capitallosscarry(?:over|forward)(?:for|to)20\d\d/i.test(tight)) kinds.push('worksheet');
  return { kinds, year };
}

function markerAt(text, markers) {
  const tokens = text.split(' ');
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (!markers.includes(tokens[i].toLowerCase().replace(/\.$/, ''))) continue;
    const rest = tokens.slice(i + 1).join(' ');
    if (!rest || /^[\s.()$]*$/.test(rest)) return { amount: null };
    const amounts = rest.match(AMOUNT_TOKEN);
    if (!amounts || rest.replace(AMOUNT_TOKEN, '').replace(/[\s.$()]/g, '') !== '') continue;
    const cents = amounts.length === 2 && /^\d{2}$/.test(amounts[1].trim()) && !/\./.test(amounts[0]);
    const value = parseAmount(cents ? `${amounts[0].replace(/[()\s]/g, '')}.${amounts[1].trim()}` : amounts[0]);
    if (value === null) continue;
    return { amount: /^\s*\(/.test(rest) && value > 0 ? -value : value };
  }
  return null;
}

function contextOf(lines, index) {
  return lines.slice(Math.max(0, index - 2), index + 1).map((line) => line.text).join(' ');
}

function observe(store, key, observation) {
  if (observation.value === null || observation.value === undefined || !Number.isFinite(observation.value)) return;
  if (!store[key]) store[key] = [];
  store[key].push(observation);
}

function fieldShortName(name) {
  return name.replace(/^topmostSubform\[0\]\./, '').replace(/^form1\[0\]\./, '');
}

function readFields(read, pages, years, store) {
  const byKind = new Map();
  for (const page of pages) for (const kind of page.kinds) byKind.set(kind, (byKind.get(kind) || 0) + 1);
  const named = new Map();
  for (const field of read.fields) named.set(fieldShortName(field.name), field);
  const identity = {};
  for (const year of years) {
    const layout = IRS_1040_FIELDS[year];
    if (!layout) continue;
    for (const [kind, map] of Object.entries(layout)) {
      for (const [key, short] of Object.entries(map)) {
        const field = named.get(short);
        if (!field || !field.value) continue;
        const page = pages.find((item) => item.index === field.page);
        const pageFits = page ? page.kinds.includes(kind) && (!page.year || page.year === year) : byKind.size <= 1;
        if (!pageFits) continue;
        if (['firstName', 'lastName', 'ssn', 'spouseSsn'].includes(key)) {
          if (!identity[key]) identity[key] = field.value;
          continue;
        }
        observe(store, key, { value: parseAmount(field.value), where: `${TARGETS[kind][key].line}, form field ${short}`, confidence: 0.95, kind });
      }
    }
  }
  for (const field of read.fields) {
    const value = parseAmount(field.value);
    if (value === null || !field.rect || field.page === undefined) continue;
    const page = pages.find((item) => item.index === field.page);
    if (!page) continue;
    const [, y1, , y2] = field.rect;
    page.lines.forEach((line, index) => {
      if (line.y < y1 - 3 || line.y > y2 + 3) return;
      for (const kind of page.kinds) {
        for (const [key, target] of Object.entries(TARGETS[kind])) {
          const marker = markerAt(line.text, target.markers);
          if (!marker || marker.amount !== null) continue;
          const context = contextOf(page.lines, index);
          const match = target.context.exec(context);
          if (!match) continue;
          observe(store, key, { value: target.year ? Math.abs(value) : value, where: `${target.line}, form field ${fieldShortName(field.name)}`, confidence: 0.85, kind, year: target.year ? match[1] : undefined });
        }
      }
    });
  }
  return identity;
}

function readText(pages, store) {
  for (const page of pages) {
    page.lines.forEach((line, index) => {
      for (const kind of page.kinds) {
        for (const [key, target] of Object.entries(TARGETS[kind])) {
          const marker = markerAt(line.text, target.markers);
          if (!marker || marker.amount === null) continue;
          const match = target.context.exec(contextOf(page.lines, index));
          if (!match) continue;
          observe(store, key, { value: target.year ? Math.abs(marker.amount) : marker.amount, where: `${target.line}, printed on page ${page.index + 1}`, confidence: page.year ? 0.8 : 0.7, kind, year: target.year ? match[1] : undefined });
        }
      }
    });
  }
}

function settle(observations, warnings, label) {
  if (!observations || !observations.length) return null;
  const sorted = observations.slice().sort((a, b) => b.confidence - a.confidence);
  const best = { ...sorted[0] };
  const differs = sorted.find((item) => item.confidence >= 0.6 && item.value !== best.value);
  if (differs) {
    best.confidence = Math.min(best.confidence, 0.5);
    warnings.push(`${label} reads as ${best.value} in one place and ${differs.value} in another; check it against the return.`);
  }
  return best;
}

function identityFromLayout(pages, read, identity) {
  const out = { ...identity };
  const page = pages.find((item) => item.kinds.includes('f1040'));
  if (!page) return out;
  const labelIndex = page.lines.findIndex((line) => /your first name and middle initial/i.test(line.text));
  if (labelIndex < 0) return out;
  const label = page.lines[labelIndex];
  if (!out.firstName && !out.ssn) {
    const below = read.fields.filter((field) => field.page === page.index && field.rect && field.value && field.rect[3] <= label.y + 2 && field.rect[3] >= label.y - 24).sort((a, b) => a.rect[0] - b.rect[0]);
    if (below.length) {
      const ssnField = below.find((field) => /\d{4}\s*$/.test(field.value) && /^[\dXx*•\s-]{9,13}$/.test(field.value));
      const names = below.filter((field) => field !== ssnField).map((field) => field.value.trim()).filter(Boolean);
      if (names[0]) out.firstName = names[0];
      if (names[1]) out.lastName = names[1];
      if (ssnField) out.ssn = ssnField.value;
    }
  }
  if (!out.firstName && !out.ssn) {
    const next = page.lines[labelIndex + 1];
    if (next && label.y - next.y < 24 && !/spouse/i.test(next.text)) {
      const ssn = /(?:\d{3}|[Xx*•]{3})[- ]?(?:\d{2}|[Xx*•]{2})[- ]?(\d{4})\b/.exec(next.text);
      const rest = next.text.replace(ssn ? ssn[0] : '', ' ').replace(/\s+/g, ' ').trim();
      if (ssn) out.ssn = ssn[0];
      if (rest && rest.length <= 80 && !/\d{3}/.test(rest)) out.name = rest;
    }
  }
  return out;
}

function lastFour(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 4 && /\d{4}\s*$/.test(String(raw).trim()) ? digits.slice(-4) : '';
}

const clean = (text) => String(text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

function carryoverFromScheduleD(found, notes) {
  const sd21 = found.sd21?.value;
  const sd16 = found.sd16?.value;
  if (sd21 === undefined && sd16 === undefined) return {};
  const allowed = Math.abs(sd21 || 0);
  const loss = sd16 !== undefined && sd16 < 0 ? -sd16 : 0;
  if (!(loss > allowed) && !(found.agi && found.line14 && found.agi.value - found.line14.value < 0 && allowed > 0)) return {};
  const inputs = ['sd7', 'sd15', 'sd21', 'agi', 'line14'];
  if (inputs.some((key) => !found[key])) {
    notes.push(`Schedule D shows a capital loss of ${loss.toLocaleString('en-US')} with ${allowed.toLocaleString('en-US')} allowed, so part of it carries over; enter the short- and long-term carryovers from your Capital Loss Carryover Worksheet.`);
    return {};
  }
  const line1 = found.agi.value - found.line14.value;
  const line2 = allowed;
  const line3 = Math.max(0, line1 + line2);
  const line4 = Math.min(line2, line3);
  const sd7 = found.sd7.value;
  const sd15 = found.sd15.value;
  const line5 = sd7 < 0 ? -sd7 : 0;
  const line6 = sd15 > 0 ? sd15 : 0;
  const line8 = sd7 < 0 ? Math.max(0, line5 - (line4 + line6)) : 0;
  const line9 = sd15 < 0 ? -sd15 : 0;
  const line10 = sd7 > 0 ? sd7 : 0;
  const line11 = Math.max(0, line4 - line5);
  const line13 = sd15 < 0 ? Math.max(0, line9 - (line10 + line11)) : 0;
  const confidence = Math.round(Math.min(...inputs.map((key) => found[key].confidence)) * 0.8 * 100) / 100;
  const where = 'worked out with the Capital Loss Carryover Worksheet from Schedule D lines 7, 15 and 21 and Form 1040 lines 11 and 14';
  notes.push('The capital loss carryover was worked out from Schedule D because the worksheet was not in the PDF; check it against your worksheet.');
  const out = {};
  if (line8 > 0) out.shortTermLossCarryover = { value: Math.round(line8 * 100) / 100, where, confidence };
  if (line13 > 0) out.longTermLossCarryover = { value: Math.round(line13 * 100) / 100, where, confidence };
  return out;
}

export function readUsPriorYearPdf(content, options = {}) {
  try {
    return readReturn(content, options);
  } catch {
    return { ok: false, error: 'PDF_UNREADABLE' };
  }
}

function readReturn(content, { priorYear } = {}) {
  const read = readPdf(content);
  if (!read.ok) return { ok: false, error: read.error };
  const pages = read.pages.map((page) => ({ index: page.page, lines: page.lines.map((line) => ({ ...line, text: normalise(line.text) })) })).map((page) => ({ ...page, ...classify(page) }));
  const fieldPages = new Set(read.fields.map((field) => field.page).filter((page) => page !== undefined));
  for (let index = 0; index < read.pageCount; index += 1) {
    if (!pages.some((page) => page.index === index) && fieldPages.has(index)) pages.push({ index, lines: [], kinds: [], year: null });
  }
  const formYears = pages.filter((page) => page.kinds.includes('f1040') && page.year).map((page) => page.year);
  const counts = new Map();
  for (const year of formYears) counts.set(year, (counts.get(year) || 0) + 1);
  let taxYear = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const names = new Set(read.fields.map((field) => fieldShortName(field.name)));
  if (!taxYear && !pages.some((page) => page.kinds.length)) {
    if (names.has(IRS_1040_FIELDS[2025].f1040.agi)) taxYear = '2025';
    else if (names.has(IRS_1040_FIELDS[2024].f1040.agi) && names.has(IRS_1040_FIELDS[2024].f1040.overpaymentApplied)) taxYear = '2024';
    if (taxYear) for (const page of pages) if (!page.kinds.length) page.kinds.push('f1040');
  }
  if (!pages.some((page) => page.kinds.length)) return { ok: false, error: 'NOT_A_FORM_1040', hint: 'No Form 1040 or Schedule D page was found in this PDF. Upload the PDF of last year\'s return, or type the figures.' };
  const store = {};
  const years = taxYear ? [taxYear] : Object.keys(IRS_1040_FIELDS);
  const identityFields = readFields(read, pages, years, store);
  readText(pages, store);
  const warnings = [];
  const notes = [];
  const found = {};
  const labels = { agi: 'Adjusted gross income', totalTax: 'Total tax', overpaymentApplied: 'Refund applied to next year', line14: 'Deductions (line 14)', line7: 'Capital gain or loss (line 7)', sd7: 'Schedule D line 7', sd15: 'Schedule D line 15', sd16: 'Schedule D line 16', sd21: 'Schedule D line 21', shortTermLossCarryover: 'Short-term loss carryover', longTermLossCarryover: 'Long-term loss carryover' };
  for (const [key, list] of Object.entries(store)) {
    const usable = list.filter((item) => !item.year || !priorYear || item.year === String(Number(priorYear) + 1));
    if (list.length && !usable.length) notes.push(`The PDF has a capital loss carryover worksheet for another year (${list[0].year}); it was not used.`);
    const best = settle(usable, warnings, labels[key] || key);
    if (best) found[key] = best;
  }
  for (const key of ['agi', 'totalTax', 'overpaymentApplied', 'line14']) {
    if (found[key] && found[key].value < 0) {
      warnings.push(`${labels[key]} reads as a negative amount; it was left out.`);
      delete found[key];
    }
  }
  if (!found.shortTermLossCarryover && !found.longTermLossCarryover) Object.assign(found, carryoverFromScheduleD(found, notes));
  if (!found.shortTermLossCarryover && !found.longTermLossCarryover && !found.sd16 && found.line7 && found.line7.value < 0) {
    notes.push(`Line 7 shows a capital loss of ${Math.abs(found.line7.value).toLocaleString('en-US')}; if your losses were larger you have a carryover. Add Schedule D and the Capital Loss Carryover Worksheet, or type the carryovers.`);
  }
  const identity = identityFromLayout(pages, read, identityFields);
  const name = clean(identity.name || [identity.firstName, identity.lastName].filter(Boolean).join(' '));
  const filer = { name, lastName: clean(identity.lastName || ''), ssnLast4: lastFour(identity.ssn), spouseSsnLast4: lastFour(identity.spouseSsn) };
  const figures = {};
  for (const key of ['agi', 'totalTax', 'overpaymentApplied', 'shortTermLossCarryover', 'longTermLossCarryover']) {
    if (found[key]) figures[key] = { value: Math.abs(found[key].value), where: found[key].where, confidence: found[key].confidence };
  }
  for (const [key, item] of Object.entries(figures)) if (item.confidence < 0.6) warnings.push(`${labels[key]} was hard to read; check it against the PDF.`);
  return { ok: true, taxYear, filer, figures, warnings, notes, pages: read.pageCount, fillable: read.fields.some((field) => field.value), producer: read.producer };
}
