import { appendAuditEvent } from '../../ca-api.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { emirateOf, fail, isIsoDate } from './common.mjs';
import { checkTrn, checkTin } from './trn.mjs';
import { vatReturn, vatRegistrationCheck } from './vat.mjs';
import { corporateTaxEstimate } from './corporate-tax.mjs';
import { uaeDeadlines } from './deadlines.mjs';
import { penaltyEstimate } from './penalties.mjs';
import { buildPintAe } from './einvoice.mjs';
import { sendThroughAsp, issuedEinvoices, aspMode } from './asp.mjs';
import { createAeInvoice, createAePurchase, createAeCreditNote, planAeInvoice, planAePurchase, planAeCreditNote, aeVatLines } from './books.mjs';
import { langOf, localise, toArabic } from './messages.mjs';

const PROFILE_FIELDS = ['name', 'nameAr', 'trn', 'tin', 'legalId', 'legalIdType', 'emirate', 'city', 'addressLine', 'freeZone', 'freeZoneName', 'financialYearEnd', 'vatPeriod'];
const YEAR_END = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function savedProfile(state) {
  const slice = countrySlice(state, 'aeProfile');
  return slice && slice.business ? slice.business : null;
}

function withSeller(state, args) {
  const profile = savedProfile(state);
  const seller = args.seller || (profile ? { ...profile, legalIdType: profile.legalIdType || 'TL', country: 'AE' } : undefined);
  return { ...args, seller };
}

function profileFrom(args) {
  const out = Object.fromEntries(PROFILE_FIELDS.filter((key) => args[key] !== undefined && args[key] !== null && args[key] !== '').map((key) => [key, typeof args[key] === 'string' ? args[key].trim() : args[key]]));
  if (out.trn) out.trn = out.trn.replace(/[\s-]/g, '');
  const emirate = emirateOf(out.emirate);
  if (emirate) out.emirate = emirate.code;
  return out;
}

function profileProblems(profile) {
  const problems = [];
  if (!profile.name) problems.push({ field: 'name', why: 'The legal name on the trade licence is required.' });
  if (!emirateOf(profile.emirate)) problems.push({ field: 'emirate', why: 'Choose the emirate: AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ.' });
  if (profile.trn) {
    const trn = checkTrn(profile.trn);
    if (!trn.valid) problems.push({ field: 'trn', why: trn.why });
  }
  if (profile.tin && !checkTin(profile.tin).valid) problems.push({ field: 'tin', why: 'A TIN is 10 digits, the first 10 of the TRN.' });
  if (profile.trn && profile.tin && checkTrn(profile.trn).tin !== profile.tin) problems.push({ field: 'tin', why: 'The TIN must be the first 10 digits of the TRN.' });
  if (profile.financialYearEnd && !YEAR_END.test(profile.financialYearEnd)) problems.push({ field: 'financialYearEnd', why: 'Write the financial year end as MM-DD, for example 12-31.' });
  if (profile.freeZone === true && !profile.freeZoneName) problems.push({ field: 'freeZoneName', why: 'Name the free zone (for example DMCC, JAFZA, IFZA).' });
  return problems;
}

function amount(value) {
  return Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function aed(value, lang = 'en') {
  return lang === 'ar' ? `${amount(value)} درهم` : `AED ${amount(value)}`;
}

function fils(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function vatReturnRun(state, args) {
  if (args.fromBooks !== true) return vatReturn(args);
  const books = aeVatLines(state, args);
  if (!books.ok) return books;
  const result = vatReturn({ ...args, lines: [...books.data.lines, ...(Array.isArray(args.lines) ? args.lines : [])] });
  if (!result.ok) return result;
  return { ok: true, data: { ...result.data, fromBooks: books.data.counts, warnings: [...books.data.warnings, ...result.data.warnings] } };
}

function blockersOf(planned, lang) {
  if (planned.ok) return [];
  const fixed = localise(planned, lang);
  const problems = fixed.problems && fixed.problems.length ? fixed.problems : null;
  const line = (at) => (lang === 'ar' ? `السطر ${at + 1}` : `Line ${at + 1}`);
  return problems ? problems.map((problem) => `${problem.line !== undefined && problem.line >= 0 ? `${line(problem.line)} ` : ''}${problem.field}: ${problem.why}`) : [fixed.hint || fixed.error];
}

const EFFECT_AR = Object.freeze({
  'VAT returns, corporate tax estimates and e-invoices use these details.': 'تستخدم إقرارات ضريبة القيمة المضافة وتقديرات ضريبة الشركات والفواتير الإلكترونية هذه البيانات.',
  'Checked against PINT AE and saved with a UUID; nothing is sent to the FTA.': 'يتم التحقق وفق PINT AE والحفظ برقم تعريف فريد؛ ولا يُرسل شيء إلى الهيئة.',
  'The ASP delivers it to the buyer and reports the tax data to the FTA.': 'يسلّمها مزود الخدمة المعتمد إلى المشتري ويبلّغ الهيئة بالبيانات الضريبية.',
  'An issued e-invoice is corrected only by a credit note.': 'لا تُصحَّح الفاتورة الإلكترونية الصادرة إلا بإشعار دائن.',
  'No Accredited Service Provider is connected yet; live e-invoices cannot be sent.': 'لم يُربط بعد أي مزود خدمة معتمد؛ لا يمكن إرسال الفواتير الإلكترونية الفعلية.',
});

function effectAr(text) {
  return EFFECT_AR[text] || toArabic(text);
}

function localiseRuns(table) {
  return Object.freeze(Object.fromEntries(Object.entries(table).map(([name, run]) => [name, (state, args = {}) => localise(run(state, args), langOf(args))])));
}

function einvoice(state, args) {
  if (args.issueDate !== undefined && !isIsoDate(args.issueDate)) return buildPintAe(withSeller(state, args));
  return buildPintAe(withSeller(state, { issueDate: new Date().toISOString().slice(0, 10), ...args }));
}

export const ENGINE = Object.freeze({
  country: 'AE',
  run: localiseRuns({
    ae_business_profile: (state) => {
      const business = savedProfile(state);
      return { ok: true, data: { saved: Boolean(business), business: business || null, updatedAt: countrySlice(state, 'aeProfile').updatedAt || null } };
    },
    ae_ct_estimate: (state, args = {}) => corporateTaxEstimate(args),
    ae_deadlines: (state, args = {}) => uaeDeadlines(args),
    ae_einvoice_check: (state, args = {}) => {
      const built = einvoice(state, args);
      if (!built.ok) return built;
      return { ok: true, data: { ready: true, mode: aspMode(), totals: built.totals, document: built.document, warnings: built.warnings, xml: built.xml } };
    },
    ae_einvoice_list: (state) => ({ ok: true, data: { mode: aspMode(), einvoices: issuedEinvoices(state).sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1)) } }),
    ae_penalty_estimate: (state, args = {}) => penaltyEstimate(args),
    ae_vat_registration: (state, args = {}) => vatRegistrationCheck(args),
    ae_vat_lines: (state, args = {}) => aeVatLines(state, args),
    ae_vat_return: (state, args = {}) => vatReturnRun(state, args),
    create_ae_credit_note: (state, args = {}) => createAeCreditNote(state, args),
    create_ae_invoice: (state, args = {}) => createAeInvoice(state, args),
    create_ae_purchase: (state, args = {}) => createAePurchase(state, args),
    issue_ae_einvoice: (state, args = {}) => {
      const built = einvoice(state, args);
      if (!built.ok) return built;
      return sendThroughAsp(state, { document: built.document, xml: built.xml, totals: built.totals, actorId: args.actorId || 'owner' });
    },
    set_ae_business_profile: (state, args = {}) => {
      const profile = profileFrom(args);
      const problems = profileProblems(profile);
      if (problems.length) return fail('BUSINESS_PROFILE_INCOMPLETE', { problems });
      const slice = openCountrySlice(state, 'aeProfile');
      const before = slice.business ? { name: slice.business.name, trn: slice.business.trn || null } : null;
      slice.business = profile;
      slice.updatedAt = new Date().toISOString();
      appendAuditEvent(state, { action: 'ae_business_profile_set', actorId: args.actorId || 'owner', metadata: { before, after: { name: profile.name, trn: profile.trn || null, emirate: profile.emirate, freeZone: profile.freeZone === true } } });
      return { ok: true, data: { saved: true, business: profile } };
    },
    validate_ae_trn: (state, args = {}) => ({ ok: true, data: checkTrn(args.trn) }),
  }),
  preview: Object.freeze({
    create_ae_credit_note: (state, args = {}) => {
      const lang = langOf(args);
      const planned = planAeCreditNote(state, args);
      if (!planned.ok) return { blockers: blockersOf(planned, lang), summary: lang === 'ar' ? 'الإشعار الدائن غير جاهز.' : 'The credit note is not ready.', effects: [], figures: {} };
      const { plan } = planned;
      const total = fils(plan.total / 100);
      const vat = fils(plan.vat / 100);
      return lang === 'ar'
        ? { blockers: [], summary: `إشعار دائن على ${plan.invoice.id} لصالح ${plan.invoice.partyName} بمبلغ ${aed(total, lang)}، منها ضريبة ${aed(vat, lang)}.`, effects: ['تنخفض المبيعات وضريبة المخرجات في فترة الإشعار الدائن.', plan.full ? 'تُلغى الفاتورة بالكامل وتبقى في الدفاتر.' : 'تبقى الفاتورة كما هي ويقل المبلغ المستحق عليها.'], figures: { net: fils(plan.net / 100), vat, total } }
        : { blockers: [], summary: `Credit note on ${plan.invoice.id} to ${plan.invoice.partyName} for ${aed(total)}, of which ${aed(vat)} VAT.`, effects: ['Sales and output VAT go down in the period of the credit note.', plan.full ? 'The invoice is cancelled in full and stays in the books.' : 'The invoice stays as it is and its balance goes down.'], figures: { net: fils(plan.net / 100), vat, total } };
    },
    create_ae_invoice: (state, args = {}) => {
      const lang = langOf(args);
      const planned = planAeInvoice(state, args);
      if (!planned.ok) return { blockers: blockersOf(planned, lang), summary: lang === 'ar' ? 'الفاتورة غير جاهزة.' : 'The invoice is not ready.', effects: [], figures: {} };
      const { plan } = planned;
      const net = fils(plan.net / 100);
      const vat = fils(plan.vat / 100);
      const total = fils(plan.total / 100);
      const effects = lang === 'ar'
        ? [`تُسجَّل ${aed(vat, lang)} ضريبة مخرجات${plan.emirate ? ` في خانة إمارة ${plan.emirate}` : ''} في إقرار VAT 201.`, ...plan.warnings.map(toArabic)]
        : [`${aed(vat)} output VAT goes to the VAT 201${plan.emirate ? ` box for ${plan.emirate}` : ''}.`, ...plan.warnings];
      return {
        blockers: [],
        summary: lang === 'ar' ? `فاتورة إلى ${plan.partyName} بتاريخ ${plan.date}: ${aed(net, lang)} زائد ضريبة ${aed(vat, lang)}، الإجمالي ${aed(total, lang)}.` : `Invoice to ${plan.partyName} on ${plan.date}: ${aed(net)} plus ${aed(vat)} VAT, ${aed(total)} in all.`,
        effects,
        figures: { net, vat, total },
      };
    },
    create_ae_purchase: (state, args = {}) => {
      const lang = langOf(args);
      const planned = planAePurchase(state, args);
      if (!planned.ok) return { blockers: blockersOf(planned, lang), summary: lang === 'ar' ? 'فاتورة الشراء غير جاهزة.' : 'The bill is not ready.', effects: [], figures: {} };
      const { plan } = planned;
      const net = fils(plan.net / 100);
      const vat = fils(plan.paidVat / 100);
      const selfVat = fils(plan.selfVat / 100);
      const recoverable = fils((plan.recoverablePaid + plan.recoverableSelf) / 100);
      const total = fils(plan.total / 100);
      const effects = lang === 'ar'
        ? [`ضريبة مدخلات قابلة للاسترداد: ${aed(recoverable, lang)}.`, ...(selfVat ? [`احتساب عكسي: ${aed(selfVat, lang)} تُسجَّل كضريبة مخرجات ومدخلات معًا.`] : []), ...plan.warnings.map(toArabic)]
        : [`Recoverable input VAT: ${aed(recoverable)}.`, ...(selfVat ? [`Reverse charge: ${aed(selfVat)} is booked as both output and input VAT.`] : []), ...plan.warnings];
      return {
        blockers: [],
        summary: lang === 'ar' ? `فاتورة شراء من ${plan.partyName} بتاريخ ${plan.date}: ${aed(net, lang)} زائد ضريبة ${aed(vat, lang)}، المستحق للمورد ${aed(total, lang)}.` : `Bill from ${plan.partyName} on ${plan.date}: ${aed(net)} plus ${aed(vat)} VAT, ${aed(total)} owed to the supplier.`,
        effects,
        figures: { net, vat, selfAccountedVat: selfVat, recoverableVat: recoverable, total },
      };
    },
    issue_ae_einvoice: (state, args = {}) => {
      const lang = langOf(args);
      const built = einvoice(state, args);
      if (!built.ok) {
        const fixed = localise(built, lang);
        return { blockers: (fixed.problems || [{ field: fixed.error, why: fixed.hint || (lang === 'ar' ? 'غير جاهزة.' : 'Not ready.') }]).map((problem) => `${problem.field}: ${problem.why}`), summary: lang === 'ar' ? `الفاتورة الإلكترونية ${args.number || ''} غير جاهزة.` : `E-invoice ${args.number || ''} is not ready.`, effects: [], figures: {} };
      }
      const sandbox = aspMode() !== 'live';
      const credit = built.document.type === 'credit-note';
      const foreign = built.totals.currency === 'AED' ? '' : ` (${built.totals.currency} ${built.totals.payable.toFixed(2)})`;
      const blockers = sandbox ? [] : ['No Accredited Service Provider is connected yet; live e-invoices cannot be sent.'];
      const effects = sandbox ? ['Checked against PINT AE and saved with a UUID; nothing is sent to the FTA.'] : ['The ASP delivers it to the buyer and reports the tax data to the FTA.', 'An issued e-invoice is corrected only by a credit note.'];
      const summary = lang === 'ar'
        ? `${sandbox ? 'تسجيل (وضع التجربة)' : 'إرسال'} ${credit ? 'الإشعار الدائن' : 'الفاتورة الإلكترونية'} ${built.document.number} بمبلغ ${aed(built.totals.payableAed, lang)}${foreign}.`
        : `${sandbox ? 'Record (sandbox)' : 'Send'} ${credit ? 'credit note' : 'e-invoice'} ${built.document.number} for ${aed(built.totals.payableAed)}${foreign}.`;
      return {
        blockers: lang === 'ar' ? blockers.map(effectAr) : blockers,
        summary,
        effects: lang === 'ar' ? effects.map(effectAr) : effects,
        figures: { net: built.totals.net, tax: built.totals.tax, payable: built.totals.payable },
      };
    },
    set_ae_business_profile: (state, args = {}) => {
      const lang = langOf(args);
      const profile = profileFrom(args);
      const problems = profileProblems(profile);
      const why = (text) => (lang === 'ar' ? toArabic(text) : text);
      const name = profile.name || (lang === 'ar' ? 'المنشأة' : 'the business');
      return {
        blockers: problems.map((problem) => `${problem.field}: ${why(problem.why)}`),
        summary: lang === 'ar' ? `حفظ ${name}${profile.trn ? ` (رقم التسجيل الضريبي ${profile.trn})` : ''} كملف المنشأة في الإمارات.` : `Save ${name}${profile.trn ? ` (TRN ${profile.trn})` : ''} as the UAE business profile.`,
        effects: [lang === 'ar' ? effectAr('VAT returns, corporate tax estimates and e-invoices use these details.') : 'VAT returns, corporate tax estimates and e-invoices use these details.'],
        figures: {},
      };
    },
  }),
  words: Object.freeze({
    ae_business_profile: (result, money, args = {}) => {
      if (!result.ok) return '';
      const ar = langOf(args) === 'ar';
      const business = result.data.business;
      if (!business) return ar ? 'لم يُحفظ ملف المنشأة بعد.' : 'No UAE business profile is saved yet.';
      return ar ? `ملف المنشأة: ${business.nameAr || business.name}${business.trn ? `، رقم التسجيل الضريبي ${business.trn}` : ''}، ${business.emirate}.` : `Business profile: ${business.name}${business.trn ? `, TRN ${business.trn}` : ''}, ${business.emirate}.`;
    },
    ae_ct_estimate: (result, money, args = {}) => {
      if (!result.ok) return '';
      const lang = langOf(args);
      const d = result.data;
      if (d.relief === 'small-business-relief') return lang === 'ar' ? `مع إعفاء الأعمال الصغيرة تكون ضريبة الشركات للفترة من ${d.periodStart} إلى ${d.periodEnd} صفر درهم. ويظل الإقرار مستحقًا بحلول ${d.due}.` : `With Small Business Relief the corporate tax for ${d.periodStart} to ${d.periodEnd} is AED 0. The return is still due by ${d.due}.`;
      return lang === 'ar' ? `الدخل الخاضع للضريبة ${aed(d.taxableIncome, lang)} وضريبة الشركات ${aed(d.payable, lang)}، مستحقة بحلول ${d.due}. لم يراجع هذه الأرقام وكيل ضريبي مسجّل بعد.` : `Taxable income is ${aed(d.taxableIncome)} and corporate tax is ${aed(d.payable)}, due by ${d.due}. These figures are not yet reviewed by a UAE registered tax agent.`;
    },
    ae_deadlines: (result, money, args = {}) => {
      if (!result.ok) return '';
      const ar = langOf(args) === 'ar';
      const next = result.data.next;
      if (!next) return ar ? 'لا توجد مواعيد قادمة لهذه البيانات.' : 'No upcoming dates for these details.';
      return ar ? `الموعد التالي: ${next.what} بحلول ${next.date} (بعد ${next.daysLeft} يومًا).` : `Next: ${next.what} by ${next.date} (${next.daysLeft} days left).`;
    },
    ae_einvoice_check: (result, money, args = {}) => {
      const lang = langOf(args);
      if (lang === 'ar') return result.ok ? `الفاتورة الإلكترونية جاهزة: ضريبة ${aed(result.data.totals.taxAed, lang)} والمستحق ${aed(result.data.totals.payableAed, lang)}.` : `تحتاج الفاتورة الإلكترونية إلى ${(result.problems || []).length} تصحيحات قبل إصدارها.`;
      return result.ok ? `The e-invoice is ready: ${aed(result.data.totals.taxAed)} VAT and ${aed(result.data.totals.payableAed)} payable.` : `The e-invoice needs ${(result.problems || []).length} fixes before it can be issued.`;
    },
    ae_einvoice_list: (result, money, args = {}) => {
      if (!result.ok) return '';
      const count = result.data.einvoices.length;
      return langOf(args) === 'ar' ? `عدد الفواتير الإلكترونية الصادرة من MyCA: ${count}.` : `${count} e-invoice${count === 1 ? '' : 's'} issued from MyCA.`;
    },
    ae_penalty_estimate: (result, money, args = {}) => {
      if (!result.ok) return '';
      const lang = langOf(args);
      return lang === 'ar' ? `الغرامة المقدرة ${aed(result.data.penalty, lang)}. ${result.data.why}` : `The estimated penalty is ${aed(result.data.penalty)}. ${result.data.why}`;
    },
    ae_vat_lines: (result, money, args = {}) => {
      if (!result.ok) return '';
      const c = result.data.counts;
      return langOf(args) === 'ar' ? `من الدفاتر للفترة ${result.data.period}: ${c.invoices} فاتورة مبيعات، ${c.creditNotes} إشعار دائن، ${c.purchases} فاتورة شراء.` : `From the books for ${result.data.period}: ${c.invoices} sales invoices, ${c.creditNotes} credit notes and ${c.purchases} purchase bills.`;
    },
    ae_vat_registration: (result, money, args = {}) => (result.ok ? result.data.why : ''),
    ae_vat_return: (result, money, args = {}) => {
      if (!result.ok) return '';
      const lang = langOf(args);
      const d = result.data;
      if (lang === 'ar') {
        return d.refund
          ? `إقرار VAT 201 للفترة ${d.period}: ضريبة المخرجات ${aed(d.totalDue, lang)}، القابلة للاسترداد ${aed(d.totalRecoverable, lang)}، فيكون ${aed(-d.payable, lang)} قابلًا للاسترداد أو الترحيل. قدّمه عبر EmaraTax بحلول ${d.due}.`
          : `إقرار VAT 201 للفترة ${d.period}: ضريبة المخرجات ${aed(d.totalDue, lang)}، القابلة للاسترداد ${aed(d.totalRecoverable, lang)}، والمستحق ${aed(d.payable, lang)} يُسدَّد بحلول ${d.due} عبر EmaraTax.`;
      }
      return d.refund
        ? `VAT 201 for ${d.period}: output tax ${aed(d.totalDue)}, recoverable ${aed(d.totalRecoverable)}, so ${aed(-d.payable)} is refundable or carried forward. File on EmaraTax by ${d.due}.`
        : `VAT 201 for ${d.period}: output tax ${aed(d.totalDue)}, recoverable ${aed(d.totalRecoverable)}, ${aed(d.payable)} to pay by ${d.due} on EmaraTax.`;
    },
    create_ae_credit_note: (result, money, args = {}) => {
      if (!result.ok) return '';
      const n = result.creditNote;
      return langOf(args) === 'ar' ? `صدر الإشعار الدائن ${n.id} على ${n.invoiceId} بمبلغ ${aed(n.total, 'ar')}، منها ضريبة ${aed(n.vat, 'ar')}.` : `Credit note ${n.id} on ${n.invoiceId} for ${aed(n.total)}, of which ${aed(n.vat)} VAT.`;
    },
    create_ae_invoice: (result, money, args = {}) => {
      if (!result.ok) return '';
      const i = result.invoice;
      const lang = langOf(args);
      const tail = result.warnings && result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
      return lang === 'ar' ? `سُجّلت الفاتورة ${i.id} إلى ${i.partyName} بتاريخ ${i.date} بمبلغ ${aed(i.total, lang)} (${aed(i.subtotal, lang)} زائد ضريبة ${aed(i.vat, lang)}).${tail}` : `Posted ${i.id} to ${i.partyName} on ${i.date} for ${aed(i.total)} (${aed(i.subtotal)} plus ${aed(i.vat)} VAT).${tail}`;
    },
    create_ae_purchase: (result, money, args = {}) => {
      if (!result.ok) return '';
      const b = result.invoice;
      const lang = langOf(args);
      const tail = result.warnings && result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
      return lang === 'ar' ? `سُجّلت فاتورة الشراء ${b.id} من ${b.partyName} بمبلغ ${aed(b.total, lang)}؛ ضريبة المدخلات القابلة للاسترداد ${aed(b.recoverableVat, lang)}.${tail}` : `Booked ${b.id} from ${b.partyName} for ${aed(b.total)}; recoverable input VAT ${aed(b.recoverableVat)}.${tail}`;
    },
    issue_ae_einvoice: (result, money, args = {}) => {
      if (!result.ok) return '';
      const d = result.data || {};
      return langOf(args) === 'ar' ? `${result.hint || ''} الرقم ${d.number || ''}، المعرّف ${d.uuid || ''}.`.trim() : `${result.hint || ''} Number ${d.number || ''}, UUID ${d.uuid || ''}.`.trim();
    },
    set_ae_business_profile: (result, money, args = {}) => {
      if (!result.ok) return '';
      return langOf(args) === 'ar' ? `حُفظ ملف المنشأة ${result.data.business.name}.` : `Saved the UAE business profile for ${result.data.business.name}.`;
    },
    validate_ae_trn: (result, money, args = {}) => {
      if (!result.ok) return '';
      const d = result.data;
      if (!d.valid) return d.why;
      return langOf(args) === 'ar' ? `رقم التسجيل الضريبي ${d.trn} بالصيغة الصحيحة؛ ورقمه الضريبي ${d.tin}.` : `TRN ${d.trn} has the right format; its TIN is ${d.tin}.`;
    },
  }),
});
