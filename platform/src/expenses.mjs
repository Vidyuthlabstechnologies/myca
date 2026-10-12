import { createAccounts, createTransfers, listAccounts, paise } from './ledger.mjs';
import { gstSplit, partyStateOf } from './chart.mjs';
import { postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { planTds, recordTdsEntry, tdsPayableAccountId, wantsTds } from './tds-deduction.mjs';
import { rules } from './sprint-load.mjs';

export const GENERAL_HEAD = '5100';

export const EXPENSE_HEADS = [
  { code: '5100', name: 'Other expenses', keywords: [] },
  { code: '5110', name: 'Rent', keywords: ['rent', 'lease', 'godown rent', 'shop rent', 'office rent'] },
  { code: '5120', name: 'Salaries and wages', keywords: ['salary', 'salaries', 'wages', 'wage', 'staff pay', 'stipend', 'bonus', 'overtime'] },
  { code: '5130', name: 'Electricity and water', keywords: ['electricity', 'power bill', 'light bill', 'current bill', 'water bill', 'eb bill', 'mseb', 'bescom', 'tneb', 'tangedco', 'kseb', 'msedcl', 'adani electricity', 'tata power', 'bses'] },
  { code: '5140', name: 'Telephone and internet', keywords: ['phone', 'mobile', 'telephone', 'internet', 'broadband', 'wifi', 'recharge', 'jio', 'airtel', 'vi', 'bsnl', 'act fibernet', 'hathway'] },
  { code: '5150', name: 'Travel and conveyance', keywords: ['travel', 'conveyance', 'taxi', 'cab', 'auto', 'rickshaw', 'petrol', 'diesel', 'fuel', 'train', 'railway', 'flight', 'bus', 'ola', 'uber', 'rapido', 'toll', 'parking', 'irctc', 'metro'] },
  { code: '5160', name: 'Repairs and maintenance', keywords: ['repair', 'repairs', 'maintenance', 'servicing', 'amc', 'plumber', 'electrician', 'carpenter', 'painting', 'whitewash'] },
  { code: '5170', name: 'Professional fees', keywords: ['ca fees', 'ca fee', 'chartered accountant', 'auditor', 'audit fee', 'audit fees', 'lawyer', 'advocate', 'legal', 'consultant', 'consultancy', 'professional fees', 'professional fee', 'architect', 'gst filing', 'return filing'] },
  { code: '5180', name: 'Bank charges', keywords: ['bank charges', 'bank charge', 'bank fee', 'bank fees', 'neft charges', 'rtgs charges', 'imps charges', 'cheque book', 'annual maintenance charge', 'pos charges', 'mdr', 'payment gateway'] },
  { code: '5190', name: 'Office and stationery', keywords: ['stationery', 'stationary', 'paper', 'printing', 'xerox', 'photocopy', 'pens', 'pen', 'cartridge', 'toner', 'notebook', 'files', 'folders', 'office supplies', 'office expenses', 'tea', 'coffee', 'snacks', 'pantry', 'cleaning', 'housekeeping'] },
  { code: '5200', name: 'Advertising and marketing', keywords: ['advertising', 'advertisement', 'ads', 'marketing', 'google ads', 'facebook ads', 'instagram', 'hoarding', 'banner', 'flex', 'pamphlet', 'pamphlets', 'promotion', 'sponsorship', 'justdial', 'indiamart'] },
  { code: '5210', name: 'Freight and delivery', keywords: ['freight', 'transport', 'transporter', 'courier', 'delivery', 'shipping', 'cartage', 'porter', 'logistics', 'delhivery', 'dtdc', 'bluedart', 'blue dart', 'loading', 'unloading', 'hamali'] },
  { code: '5220', name: 'Insurance', keywords: ['insurance', 'premium', 'policy', 'mediclaim', 'lic'] },
  { code: '5230', name: 'Software and subscriptions', keywords: ['software', 'subscription', 'subscriptions', 'saas', 'licence', 'license', 'tally', 'zoho', 'hosting', 'domain', 'google workspace', 'microsoft 365', 'office 365', 'canva', 'app'] },
  { code: '5240', name: 'Packing material', keywords: ['packing', 'packaging', 'cartons', 'carton', 'boxes', 'bubble wrap', 'tape', 'labels', 'polybags', 'poly bags'] },
  { code: '5250', name: 'Food and refreshments', blocked: 'food-beverages-catering-beauty-health', keywords: ['food', 'lunch', 'dinner', 'breakfast', 'meals', 'meal', 'restaurant', 'hotel bill', 'swiggy', 'zomato', 'catering', 'caterer', 'canteen', 'sweets', 'refreshments', 'beverages', 'cold drinks', 'juice', 'pizza', 'biryani'] },
  { code: '5260', name: 'Staff welfare and gifts', blocked: 'gifts-free-samples-lost-stolen', keywords: ['gift', 'gifts', 'diwali gift', 'diwali gifts', 'free samples', 'free sample', 'samples', 'staff welfare', 'staff party', 'farewell', 'vouchers', 'sweets box'] },
  { code: '5270', name: 'Club and fitness memberships', blocked: 'club-health-fitness-membership', keywords: ['club', 'gym', 'fitness', 'membership', 'health club', 'cult fit', 'cultfit', 'golf', 'swimming pool'] },
  { code: '5280', name: 'Car running and insurance', blocked: 'motor-vehicle-services-insurance-repair', keywords: ['car service', 'car servicing', 'car insurance', 'car repair', 'car repairs', 'car wash', 'car maintenance', 'bike insurance', 'scooter service', 'two wheeler insurance', 'vehicle insurance', 'motor insurance'] },
  { code: '5290', name: 'Personal and household', blocked: 'personal-consumption', keywords: ['personal', 'household', 'home expenses', 'family', 'school fees', 'groceries', 'grocery', 'personal use', 'own use', 'drawings'] },
];

const HEAD_BY_CODE = new Map(EXPENSE_HEADS.map((head) => [head.code, head]));

export function expenseHeads() {
  return EXPENSE_HEADS.map(({ code, name, blocked }) => ({ code, name, ...(blocked ? { blockedCredit: true } : {}) }));
}

export function blockedCreditFor(head, date) {
  const category = typeof head === 'string' ? head : head?.blocked;
  if (!category) return { blocked: false };
  const found = rules.rule('gst.itc.blocked', date);
  if (!found.ok) return { blocked: false, error: 'GST_RULE_MISSING', ruleId: 'gst.itc.blocked' };
  const clause = found.record.value[category];
  if (!clause) return { blocked: false, ruleUsed: `${found.record.id}@${found.record.effectiveFrom}` };
  return { blocked: true, category, clause, section: `${found.record.act} Act s.${clause}`, ruleUsed: `${found.record.id}@${found.record.effectiveFrom}`, attested: (found.record.attestations || []).length > 0 };
}

export function headByWords(text) {
  const key = tagKey(text);
  if (!key) return null;
  const exact = EXPENSE_HEADS.find((head) => tagKey(head.name) === key);
  if (exact) return exact;
  const starts = EXPENSE_HEADS.filter((head) => tagKey(head.name).startsWith(key) || tagKey(head.name).split(' and ').some((part) => part.trim() === key));
  if (starts.length === 1) return starts[0];
  const byKeyword = keywordHead(text);
  if (byKeyword) return byKeyword;
  const contains = EXPENSE_HEADS.filter((head) => ` ${tagKey(head.name)} `.includes(` ${key} `));
  return contains.length === 1 ? contains[0] : null;
}

export function headNamed(code) {
  return HEAD_BY_CODE.get(String(code || '').trim()) || null;
}

export function ensureExpenseAccounts(ledger) {
  createAccounts(ledger, EXPENSE_HEADS.map(({ code, name }) => ({ id: Number(code), code, name, type: 'expense', flags: 0 })));
}

export function tagKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function words(text) {
  return ` ${tagKey(text)} `;
}

function keywordHead(description) {
  const haystack = words(description);
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const head of EXPENSE_HEADS) {
    let score = 0;
    for (const keyword of head.keywords) {
      if (haystack.includes(` ${keyword} `)) score = Math.max(score, keyword.split(' ').length);
    }
    if (score > bestScore) {
      best = head;
      bestScore = score;
      tie = false;
    } else if (score > 0 && score === bestScore) tie = true;
  }
  if (!best || tie) return null;
  return best;
}

export function tagExpense(state, { description = '', payee = '' } = {}) {
  const memory = state.expenseTags || {};
  const payeeKey = tagKey(payee);
  const textKey = tagKey(description);
  if (payeeKey && memory[`payee:${payeeKey}`] && headNamed(memory[`payee:${payeeKey}`])) {
    const head = headNamed(memory[`payee:${payeeKey}`]);
    return { head: head.code, headName: head.name, source: 'memory', why: `You tagged ${payee.trim()} as ${head.name} before.` };
  }
  if (textKey && memory[`text:${textKey}`] && headNamed(memory[`text:${textKey}`])) {
    const head = headNamed(memory[`text:${textKey}`]);
    return { head: head.code, headName: head.name, source: 'memory', why: `You tagged "${description.trim()}" as ${head.name} before.` };
  }
  const byWords = keywordHead(`${description} ${payee}`);
  if (byWords) {
    return { head: byWords.code, headName: byWords.name, source: 'keyword', why: `"${description.trim() || payee.trim()}" reads as ${byWords.name}.` };
  }
  const general = headNamed(GENERAL_HEAD);
  return { head: general.code, headName: general.name, source: 'default', why: `Nothing in "${description.trim() || payee.trim() || 'this'}" told me the head, so it is under ${general.name}. Tap to change it.` };
}

export function rememberExpenseTag(state, { description = '', payee = '' }, headCode) {
  if (!headNamed(headCode)) return;
  state.expenseTags = state.expenseTags || {};
  const payeeKey = tagKey(payee);
  const textKey = tagKey(description);
  if (payeeKey) state.expenseTags[`payee:${payeeKey}`] = headCode;
  if (textKey) state.expenseTags[`text:${textKey}`] = headCode;
}

const GSTIN_SHAPE = /^[0-9]{2}[A-Z0-9]{13}$/;

export function planExpense(state, args = {}) {
  const date = postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  const amount = Math.round(Number(args.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'BAD_AMOUNT' };
  const gstRate = args.gstRate == null || args.gstRate === '' ? 0 : Number(args.gstRate);
  if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 28) return { ok: false, error: 'BAD_RATE' };
  const mode = args.mode == null || args.mode === '' ? 'bank' : String(args.mode).toLowerCase();
  if (mode !== 'bank' && mode !== 'cash') return { ok: false, error: 'BAD_MODE' };
  const description = String(args.narration ?? args.description ?? '').trim();
  const payee = String(args.payee ?? '').trim();
  const supplierGstin = String(args.supplierGstin ?? '').trim().toUpperCase();
  if (supplierGstin && !GSTIN_SHAPE.test(supplierGstin)) return { ok: false, error: 'BAD_GSTIN' };
  const chosen = args.head == null || args.head === '' ? null : headNamed(args.head);
  if (args.head != null && args.head !== '' && !chosen) return { ok: false, error: 'UNKNOWN_HEAD', head: args.head };
  const tag = chosen
    ? { head: chosen.code, headName: chosen.name, source: 'chosen', why: `You chose ${chosen.name}.` }
    : tagExpense(state, { description, payee });

  if (mode === 'cash') {
    const cash = listAccounts(state.ledger).find((account) => account.code === '1001');
    const inHand = cash ? Math.round((cash.debitsPosted - cash.creditsPosted) * 100) / 100 : 0;
    if (inHand + 0.005 < amount) return { ok: false, error: 'INSUFFICIENT_CASH', inHand, amount };
  }
  const amountPaise = Math.round(amount * 100);
  let taxable = amount;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let inputCredit = false;
  let creditNote = '';
  const blocked = blockedCreditFor(headNamed(tag.head), date);
  if (blocked.error) return { ok: false, error: blocked.error, ruleId: blocked.ruleId };
  if (gstRate > 0 && supplierGstin && blocked.blocked) {
    creditNote = `GST ${gstRate}% is inside the amount, but input credit on ${tag.headName.toLowerCase()} is blocked (${blocked.section}), so the whole amount is cost.${blocked.attested ? '' : ' That rule has not been reviewed by your CA yet.'}`;
  } else if (gstRate > 0 && supplierGstin) {
    const taxablePaise = Math.round((amountPaise * 100) / (100 + gstRate));
    taxable = taxablePaise / 100;
    const split = gstSplit({ taxable, rate: gstRate, supplierState: partyStateOf(supplierGstin), partyState: (state.company || {}).state });
    if (split.intra) {
      const halfPaise = Math.round((amountPaise - taxablePaise) / 2);
      cgst = halfPaise / 100;
      sgst = (amountPaise - taxablePaise - halfPaise) / 100;
    } else {
      igst = (amountPaise - taxablePaise) / 100;
    }
    inputCredit = true;
    creditNote = `GST ${gstRate}% inside the amount is input credit of ${rupees(cgst + sgst + igst)} because the supplier's GSTIN is given.`;
  } else if (gstRate > 0) {
    creditNote = `GST ${gstRate}% is inside the amount, but without the supplier's GSTIN no input credit is taken; the whole amount is cost.`;
  } else {
    creditNote = 'No GST separated.';
  }
  let tds = null;
  if (wantsTds(args)) {
    const planned = planTds(state, args, { date, basis: taxable, payable: amount, payee: payee || description || 'the payee', beforeGst: inputCredit });
    if (!planned.ok) return planned;
    tds = planned.tds;
  }
  return {
    ok: true,
    plan: { date, amount, gstRate, mode, description, payee, supplierGstin, tag, taxable, cgst, sgst, igst, inputCredit, creditNote, tds, blockedCredit: blocked.blocked ? { category: blocked.category, section: blocked.section, ruleUsed: blocked.ruleUsed } : null },
  };
}

function rupees(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nextExpenseId(state) {
  state.expenseSeq = Number(state.expenseSeq || 0);
  const taken = new Set((state.expenses || []).map((expense) => expense.id));
  let id;
  do {
    state.expenseSeq += 1;
    id = `EXP-${String(state.expenseSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

export function postExpense(state, args = {}) {
  const planned = planExpense(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  ensureExpenseAccounts(state.ledger);
  const paidFrom = plan.mode === 'cash' ? 1001 : 1002;
  const seqBefore = state.transferSeq;
  const id = nextExpenseId(state);
  const transfers = [
    { id: nextTransferId(state), debitAccountId: Number(plan.tag.head), creditAccountId: paidFrom, amount: paise(plan.taxable), code: 'EXPENSE', userData: plan.date, invoiceId: id },
  ];
  if (plan.cgst > 0) transfers.push({ id: nextTransferId(state), debitAccountId: 1200, creditAccountId: paidFrom, amount: paise(plan.cgst), code: 'ITC-CGST', userData: plan.date, invoiceId: id });
  if (plan.sgst > 0) transfers.push({ id: nextTransferId(state), debitAccountId: 1201, creditAccountId: paidFrom, amount: paise(plan.sgst), code: 'ITC-SGST', userData: plan.date, invoiceId: id });
  if (plan.igst > 0) transfers.push({ id: nextTransferId(state), debitAccountId: 1202, creditAccountId: paidFrom, amount: paise(plan.igst), code: 'ITC-IGST', userData: plan.date, invoiceId: id });
  if (plan.tds && plan.tds.tds > 0) transfers.push({ id: nextTransferId(state), debitAccountId: paidFrom, creditAccountId: tdsPayableAccountId(), amount: paise(plan.tds.tds), code: `TDS-${plan.tds.section}`, userData: plan.date, invoiceId: id });
  const posted = createTransfers(state.ledger, transfers);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    state.expenseSeq -= 1;
    return { ok: false, error: 'LEDGER_REJECT', posted };
  }
  const expense = {
    id,
    date: plan.date,
    head: plan.tag.head,
    headName: plan.tag.headName,
    description: plan.description,
    payee: plan.payee,
    supplierGstin: plan.supplierGstin,
    mode: plan.mode,
    amount: plan.amount,
    gstRate: plan.gstRate,
    taxable: plan.taxable,
    cgst: plan.cgst,
    sgst: plan.sgst,
    igst: plan.igst,
    inputCredit: plan.inputCredit,
    ...(plan.blockedCredit ? { blockedCredit: plan.blockedCredit } : {}),
    ...(plan.tds ? { tds: { section: plan.tds.section, rate: plan.tds.rate, basis: plan.tds.basis, amount: plan.tds.tds, pan: plan.tds.pan } } : {}),
    tag: { source: plan.tag.source, why: plan.tag.why },
    transferIds: posted.map((result) => result.id),
  };
  if (plan.tds) recordTdsEntry(state, plan.tds, id);
  state.expenses = state.expenses || [];
  state.expenses.push(expense);
  if (plan.tag.source === 'chosen') rememberExpenseTag(state, plan, plan.tag.head);
  return { ok: true, expense, posted };
}

export function retagExpense(state, { id, head } = {}) {
  const expense = (state.expenses || []).find((item) => item.id === String(id || '').trim().toUpperCase());
  if (!expense) return { ok: false, error: 'EXPENSE_NOT_FOUND' };
  const target = headNamed(head);
  if (!target) return { ok: false, error: 'UNKNOWN_HEAD', head };
  if (isPeriodLocked(state, expense.date)) return { ok: false, error: 'PERIOD_LOCKED', date: expense.date, lockThrough: state.lockThrough };
  if (target.code === expense.head) return { ok: true, expense, posted: [], unchanged: true };
  ensureExpenseAccounts(state.ledger);
  const posted = createTransfers(state.ledger, [
    { id: nextTransferId(state), debitAccountId: Number(target.code), creditAccountId: Number(expense.head), amount: paise(expense.taxable), code: 'RETAG', userData: expense.date, invoiceId: expense.id },
  ]);
  if (!posted[0].ok) return { ok: false, error: posted[0].error };
  const from = expense.headName;
  expense.head = target.code;
  expense.headName = target.name;
  expense.tag = { source: 'chosen', why: `You moved it from ${from} to ${target.name}.` };
  expense.transferIds = [...(expense.transferIds || []), posted[0].id];
  rememberExpenseTag(state, expense, target.code);
  return { ok: true, expense, posted, from };
}

export function listExpenses(state, { period } = {}) {
  const wanted = String(period || '').trim();
  return (state.expenses || []).filter((expense) => !wanted || String(expense.date || '').startsWith(wanted));
}
