import { salaryPrivate } from './employees.mjs';
export const INVOICE_LAYOUTS = ['classic', 'minimal'];
export const DEFAULT_ACCENT = '#b42318';
const MAX_FOOTER = 300;
const MAX_TERMS = 600;
const MAX_NAME = 80;
const ACCENT = /^#[0-9a-f]{6}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^[0-9]{6,20}$/;
const UPI = /^[a-z0-9][a-z0-9._-]{1,48}@[a-z][a-z0-9]{1,30}$/;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanLines(value, max) {
  return String(value == null ? '' : value).replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean).join('\n').slice(0, max);
}

export function emptyTemplate() {
  return { accent: DEFAULT_ACCENT, layout: 'classic', signatory: '', footer: '', terms: '', bank: { name: '', account: '', ifsc: '', upi: '' }, showHsn: true };
}

export function invoiceTemplateOf(state) {
  const raw = state?.company?.invoiceTemplate;
  const base = emptyTemplate();
  if (!raw || typeof raw !== 'object') return base;
  const bank = raw.bank && typeof raw.bank === 'object' ? raw.bank : {};
  return {
    accent: ACCENT.test(String(raw.accent || '')) ? String(raw.accent) : base.accent,
    layout: INVOICE_LAYOUTS.includes(raw.layout) ? raw.layout : base.layout,
    signatory: clean(raw.signatory, MAX_NAME),
    footer: clean(raw.footer, MAX_FOOTER),
    terms: cleanLines(raw.terms, MAX_TERMS),
    bank: { name: clean(bank.name, MAX_NAME), account: clean(bank.account, 20), ifsc: clean(bank.ifsc, 11).toUpperCase(), upi: clean(bank.upi, 80).toLowerCase() },
    showHsn: raw.showHsn !== false,
  };
}

export function bankWords(bank) {
  if (!bank || !(bank.account || bank.upi)) return '';
  const parts = [];
  if (bank.name) parts.push(bank.name);
  if (bank.account) parts.push(`A/c ${bank.account}`);
  if (bank.ifsc) parts.push(`IFSC ${bank.ifsc}`);
  if (bank.upi) parts.push(`UPI ${bank.upi}`);
  return parts.join(', ');
}

export function planInvoiceTemplate(state, args = {}) {
  const before = invoiceTemplateOf(state);
  const next = { ...before, bank: { ...before.bank } };
  const changed = [];
  if (args.accent != null) {
    const accent = String(args.accent).trim().toLowerCase();
    if (accent === '' || accent === 'default') next.accent = DEFAULT_ACCENT;
    else if (!ACCENT.test(accent)) return fail('BAD_COLOUR', { accent: args.accent, hint: 'A colour is six hex digits, for example #1d4ed8.' });
    else next.accent = accent;
    changed.push('colour');
  }
  if (args.layout != null) {
    const layout = String(args.layout).trim().toLowerCase();
    if (!INVOICE_LAYOUTS.includes(layout)) return fail('BAD_LAYOUT', { layout: args.layout, hint: INVOICE_LAYOUTS.join(' or ') });
    next.layout = layout;
    changed.push('layout');
  }
  if (args.signatory != null) {
    next.signatory = clean(args.signatory, MAX_NAME);
    changed.push('signatory');
  }
  if (args.footer != null) {
    next.footer = clean(args.footer, MAX_FOOTER);
    changed.push('footer');
  }
  if (args.terms != null) {
    next.terms = cleanLines(args.terms, MAX_TERMS);
    changed.push('terms');
  }
  if (args.showHsn != null) {
    next.showHsn = Boolean(args.showHsn);
    changed.push('HSN column');
  }
  if (args.bank != null) {
    if (typeof args.bank !== 'object') return fail('BAD_BANK');
    const bank = args.bank;
    if (bank.name != null) next.bank.name = clean(bank.name, MAX_NAME);
    if (bank.account != null) {
      const account = clean(bank.account, 20).replace(/\s/g, '');
      if (account && !ACCOUNT.test(account)) return fail('BAD_ACCOUNT', { hint: 'An account number is 6 to 20 digits.' });
      next.bank.account = account;
    }
    if (bank.ifsc != null) {
      const ifsc = clean(bank.ifsc, 11).toUpperCase();
      if (ifsc && !IFSC.test(ifsc)) return fail('BAD_IFSC', { ifsc, hint: 'An IFSC is four letters, a zero and six characters, for example HDFC0001234.' });
      next.bank.ifsc = ifsc;
    }
    if (bank.upi != null) {
      const upi = clean(bank.upi, 80).toLowerCase();
      if (upi && !UPI.test(upi)) return fail('BAD_UPI', { upi, hint: 'A UPI id looks like name@bank.' });
      next.bank.upi = upi;
    }
    if (next.bank.account && !next.bank.ifsc) return fail('IFSC_REQUIRED', { hint: 'An account number on an invoice needs its IFSC.' });
    changed.push('bank details');
  }
  if (!changed.length) return fail('NOTHING_TO_CHANGE', { hint: 'Give a colour, layout, signatory, footer, terms, bank details or showHsn.' });
  return { ok: true, plan: { before, next, changed } };
}

export function setInvoiceTemplate(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner can change how invoices look and which bank account they show.' });
  const planned = planInvoiceTemplate(state, args);
  if (!planned.ok) return planned;
  state.company = state.company || {};
  state.company.invoiceTemplate = planned.plan.next;
  return { ok: true, template: planned.plan.next, changed: planned.plan.changed };
}

export function invoiceTemplate(state) {
  const template = invoiceTemplateOf(state);
  return { ok: true, data: { ...template, bankWords: bankWords(template.bank), isDefault: JSON.stringify(template) === JSON.stringify(emptyTemplate()) } };
}

export function templateWords(template) {
  const lines = [`Layout ${template.layout}, colour ${template.accent}${template.showHsn ? '' : ', HSN column hidden'}.`];
  lines.push(template.bank.account || template.bank.upi ? `Payment: ${bankWords(template.bank)}.` : 'No bank details on the invoice yet.');
  if (template.terms) lines.push(`Terms: ${template.terms.split('\n').join(' / ')}`);
  if (template.footer) lines.push(`Footer: ${template.footer}`);
  lines.push(template.signatory ? `Signed for the business by ${template.signatory}.` : 'Signed as "Authorised signatory".');
  return lines.join('\n');
}
