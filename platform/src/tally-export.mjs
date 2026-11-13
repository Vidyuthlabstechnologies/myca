import { xmlText } from './text-safe.mjs';
import { isReturnPeriod, periodOf } from './return-period.mjs';
import { localToday } from './dates.mjs';
import { isTdsReceipt } from './tds-credits.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const text = (value) => xmlText(String(value ?? '').trim());

const GROUPS = {
  customer: 'Sundry Debtors',
  supplier: 'Sundry Creditors',
  sales: 'Sales Accounts',
  purchases: 'Purchase Accounts',
  tax: 'Duties & Taxes',
  expense: 'Indirect Expenses',
  bank: 'Bank Accounts',
  cash: 'Cash-in-Hand',
  asset: 'Current Assets',
};

const LEDGERS = {
  sales: 'Sales',
  purchases: 'Purchases',
  outputCgst: 'Output CGST',
  outputSgst: 'Output SGST',
  outputIgst: 'Output IGST',
  inputCgst: 'Input CGST',
  inputSgst: 'Input SGST',
  inputIgst: 'Input IGST',
  tdsPayable: 'TDS Payable',
  bank: 'Bank',
  cash: 'Cash',
  tdsReceivable: 'TDS Receivable',
};

function tallyDate(iso) {
  return String(iso || '').replace(/-/g, '');
}

function entry(ledger, amount, debit) {
  const value = round2(amount);
  if (value <= 0) return '';
  return [
    '      <ALLLEDGERENTRIES.LIST>',
    `        <LEDGERNAME>${text(ledger)}</LEDGERNAME>`,
    `        <ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`,
    `        <AMOUNT>${debit ? '-' : ''}${value.toFixed(2)}</AMOUNT>`,
    '      </ALLLEDGERENTRIES.LIST>',
  ].join('\n');
}

function voucher({ type, date, number, party, narration, entries, reference = '' }) {
  const lines = entries.filter(Boolean);
  if (!lines.length) return '';
  return [
    '  <TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `    <VOUCHER VCHTYPE="${text(type)}" ACTION="Create">`,
    `      <DATE>${tallyDate(date)}</DATE>`,
    `      <VOUCHERTYPENAME>${text(type)}</VOUCHERTYPENAME>`,
    `      <VOUCHERNUMBER>${text(number)}</VOUCHERNUMBER>`,
    reference ? `      <REFERENCE>${text(reference)}</REFERENCE>` : '',
    party ? `      <PARTYLEDGERNAME>${text(party)}</PARTYLEDGERNAME>` : '',
    `      <NARRATION>${text(narration)}</NARRATION>`,
    ...lines,
    '    </VOUCHER>',
    '  </TALLYMESSAGE>',
  ].filter(Boolean).join('\n');
}

function ledgerMaster(name, parent, gstin = '') {
  return [
    '  <TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `    <LEDGER NAME="${text(name)}" ACTION="Create">`,
    `      <NAME>${text(name)}</NAME>`,
    `      <PARENT>${text(parent)}</PARENT>`,
    gstin ? `      <PARTYGSTIN>${text(gstin)}</PARTYGSTIN>` : '',
    gstin ? '      <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>' : '',
    '    </LEDGER>',
    '  </TALLYMESSAGE>',
  ].filter(Boolean).join('\n');
}

function describe(lines = []) {
  return lines.map((line) => line.description).filter(Boolean).join('; ');
}

function taxEntries(doc, prefix, debit) {
  return [
    entry(LEDGERS[`${prefix}Cgst`], doc.cgst, debit),
    entry(LEDGERS[`${prefix}Sgst`], doc.sgst, debit),
    entry(LEDGERS[`${prefix}Igst`], doc.igst, debit),
  ];
}

export function tallyVouchers(state, period) {
  const inPeriod = (doc) => periodOf(doc?.date) === period;
  const ledgers = new Map();
  const use = (name, group, gstin = '') => { if (!ledgers.has(name)) ledgers.set(name, { group, gstin }); };
  for (const name of ['sales', 'purchases']) use(LEDGERS[name], GROUPS[name]);
  for (const name of ['outputCgst', 'outputSgst', 'outputIgst', 'inputCgst', 'inputSgst', 'inputIgst', 'tdsPayable']) use(LEDGERS[name], GROUPS.tax);
  use(LEDGERS.bank, GROUPS.bank);
  use(LEDGERS.cash, GROUPS.cash);
  const vouchers = [];
  const push = (v) => { if (v) vouchers.push(v); };
  const paidFrom = (mode) => (mode === 'cash' ? LEDGERS.cash : LEDGERS.bank);

  for (const inv of (state.invoices || []).filter(inPeriod)) {
    use(inv.partyName, GROUPS.customer, inv.partyGstin || '');
    push(voucher({ type: 'Sales', date: inv.date, number: inv.id, party: inv.partyName, narration: describe(inv.lines), entries: [
      entry(inv.partyName, inv.total, true),
      entry(LEDGERS.sales, inv.taxable, false),
      ...taxEntries(inv, 'output', false),
    ] }));
  }
  for (const inv of state.invoices || []) {
    use(inv.partyName, GROUPS.customer, inv.partyGstin || '');
    for (const receipt of (inv.receipts || []).filter((r) => periodOf(r.date) === period)) {
      if (isTdsReceipt(receipt)) {
        use(LEDGERS.tdsReceivable, GROUPS.asset);
        push(voucher({ type: 'Journal', date: receipt.date, number: `${inv.id}-R${(inv.receipts || []).indexOf(receipt) + 1}`, party: inv.partyName, narration: `TDS withheld against ${inv.id}${receipt.section ? ` (${receipt.section})` : ''}`, reference: inv.id, entries: [
          entry(LEDGERS.tdsReceivable, receipt.amount, true),
          entry(inv.partyName, receipt.amount, false),
        ] }));
        continue;
      }
      push(voucher({ type: 'Receipt', date: receipt.date, number: `${inv.id}-R${(inv.receipts || []).indexOf(receipt) + 1}`, party: inv.partyName, narration: `Against ${inv.id}`, reference: inv.id, entries: [
        entry(paidFrom(receipt.mode), receipt.amount, true),
        entry(inv.partyName, receipt.amount, false),
      ] }));
    }
  }
  for (const note of (state.creditNotes || []).filter(inPeriod)) {
    use(note.partyName, GROUPS.customer, note.partyGstin || '');
    push(voucher({ type: 'Credit Note', date: note.date, number: note.id, party: note.partyName, narration: `${note.cancels ? 'Cancels' : 'Against'} ${note.invoiceId}: ${note.reason}`, reference: note.invoiceId, entries: [
      entry(LEDGERS.sales, note.taxable, true),
      ...taxEntries(note, 'output', true),
      entry(note.partyName, note.total, false),
    ] }));
  }
  for (const note of (state.debitNotes || []).filter(inPeriod)) {
    use(note.partyName, GROUPS.customer, note.partyGstin || '');
    push(voucher({ type: 'Debit Note', date: note.date, number: note.id, party: note.partyName, narration: `Against ${note.invoiceId}: ${note.reason}`, reference: note.invoiceId, entries: [
      entry(note.partyName, note.total, true),
      entry(LEDGERS.sales, note.taxable, false),
      ...taxEntries(note, 'output', false),
    ] }));
  }
  for (const bill of (state.purchases || []).filter(inPeriod)) {
    use(bill.partyName, GROUPS.supplier, bill.partyGstin || '');
    const blocked = bill.itcEligible === false;
    const tax = round2(bill.cgst + bill.sgst + bill.igst);
    const tds = round2(bill.tds?.amount || 0);
    push(voucher({ type: 'Purchase', date: bill.date, number: bill.id, party: bill.partyName, narration: `${bill.supplierInvoiceNo ? `Supplier bill ${bill.supplierInvoiceNo}: ` : ''}${describe(bill.lines)}`, reference: bill.supplierInvoiceNo || '', entries: [
      entry(LEDGERS.purchases, blocked ? round2(bill.taxable + tax) : bill.taxable, true),
      ...(blocked ? [] : taxEntries(bill, 'input', true)),
      entry(bill.partyName, round2(bill.total - tds), false),
      entry(LEDGERS.tdsPayable, tds, false),
    ] }));
  }
  for (const bill of state.purchases || []) {
    use(bill.partyName, GROUPS.supplier, bill.partyGstin || '');
    for (const payment of (bill.payments || []).filter((p) => periodOf(p.date) === period)) {
      push(voucher({ type: 'Payment', date: payment.date, number: `${bill.id}-P${(bill.payments || []).indexOf(payment) + 1}`, party: bill.partyName, narration: `Against ${bill.id}`, reference: bill.id, entries: [
        entry(bill.partyName, payment.amount, true),
        entry(paidFrom(payment.mode), payment.amount, false),
      ] }));
    }
  }
  for (const note of (state.purchaseNotes || []).filter(inPeriod)) {
    use(note.partyName, GROUPS.supplier, note.partyGstin || '');
    const tax = round2(note.cgst + note.sgst + note.igst);
    push(voucher({ type: 'Debit Note', date: note.date, number: note.id, party: note.partyName, narration: `Against ${note.billId}: ${note.reason}`, reference: note.billId, entries: [
      entry(note.partyName, note.total, true),
      entry(LEDGERS.purchases, note.itcEligible === false ? round2(note.taxable + tax) : note.taxable, false),
      ...(note.itcEligible === false ? [] : taxEntries(note, 'input', false)),
    ] }));
  }
  for (const expense of (state.expenses || []).filter(inPeriod)) {
    use(expense.headName, GROUPS.expense);
    const tds = round2(expense.tds?.amount || 0);
    push(voucher({ type: 'Payment', date: expense.date, number: expense.id, party: '', narration: `${expense.payee ? `${expense.payee}: ` : ''}${expense.description || expense.headName}`, entries: [
      entry(expense.headName, expense.taxable, true),
      ...(expense.inputCredit ? taxEntries(expense, 'input', true) : []),
      entry(paidFrom(expense.mode), round2(expense.amount - tds), false),
      entry(LEDGERS.tdsPayable, tds, false),
    ] }));
  }
  for (const deposit of (state.tdsDeposits || []).filter(inPeriod)) {
    push(voucher({ type: 'Payment', date: deposit.date, number: deposit.id, party: '', narration: `TDS deposited, challan ${deposit.challan}`, reference: deposit.challan, entries: [
      entry(LEDGERS.tdsPayable, deposit.amount, true),
      entry(paidFrom(deposit.mode), deposit.amount, false),
    ] }));
  }
  return { vouchers, ledgers };
}

export function exportTallyXml(state, { period } = {}) {
  const wanted = String(period || '').trim() || localToday().slice(0, 7);
  if (!isReturnPeriod(wanted)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-09.' };
  const { vouchers, ledgers } = tallyVouchers(state, wanted);
  const company = text(state.company?.name || '');
  const gstin = String(state.company?.gstin || '').trim();
  const masters = [...ledgers.entries()].map(([name, { group, gstin: partyGstin }]) => ledgerMaster(name, group, partyGstin));
  const envelope = (reportName, messages) => [
    '<ENVELOPE>',
    '  <HEADER>',
    '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
    '  </HEADER>',
    '  <BODY>',
    '    <IMPORTDATA>',
    '      <REQUESTDESC>',
    `        <REPORTNAME>${reportName}</REPORTNAME>`,
    '        <STATICVARIABLES>',
    `          <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>`,
    '        </STATICVARIABLES>',
    '      </REQUESTDESC>',
    '      <REQUESTDATA>',
    ...messages,
    '      </REQUESTDATA>',
    '    </IMPORTDATA>',
    '  </BODY>',
    '</ENVELOPE>',
  ].join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${envelope('All Masters', masters)}\n${envelope('Vouchers', vouchers)}\n`;
  return {
    ok: true,
    data: {
      period: wanted,
      count: vouchers.length,
      ledgers: ledgers.size,
      fileName: `tally_${gstin || 'books'}_${wanted}.xml`,
      xml,
      caveat: 'Two Tally import envelopes: ledger masters first, then the vouchers. Ledger names are MyCA\'s; map them to your Tally names before importing if they differ.',
    },
  };
}
