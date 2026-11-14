import { createHash } from 'node:crypto';
import { runSandboxOperation } from './sandbox-adapter.mjs';
import { gstr3bFor } from './period-summary.mjs';
import { paymentFor } from './gst-payment.mjs';
import { reviewOf } from './gst-review.mjs';
import { recordFiling, filingFor } from './filings.mjs';
import { filingRows } from './deadline-run.mjs';
import { documentsForPeriod, isReturnPeriod, fpOf } from './return-period.mjs';
import { regArg, companyAs, scopeKey } from './registrations.mjs';
import { localToday } from './dates.mjs';
import { normalizeClientId } from './books.mjs';
import { reverseChargeTotals } from './reverse-charge.mjs';
import { isSezSupply } from './chart.mjs';

const ARN = /^[A-Z0-9]{10,20}$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const TAX = 30002;
const REVERSE_CHARGE = 30003;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

const r2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const amounts = (txval, iamt, camt, samt, csamt = 0) => ({ txval: r2(txval), iamt: r2(iamt), camt: r2(camt), samt: r2(samt), csamt: r2(csamt) });
const taxOnly = (iamt, camt, samt, csamt = 0) => ({ iamt: r2(iamt), camt: r2(camt), samt: r2(samt), csamt: r2(csamt) });

function cessOf(doc) {
  return (doc.lines || []).reduce((sum, line) => sum + Number(line.cess || 0), 0);
}

function zeroRatedDoc(doc) {
  return Boolean(doc.export) || String(doc.placeOfSupply || '') === '96' || isSezSupply(doc);
}

export function cessTotals(docs) {
  const signed = [...(docs.invoices || []).map((doc) => [doc, 1]), ...(docs.debitNotes || []).map((doc) => [doc, 1]), ...(docs.creditNotes || []).map((doc) => [doc, -1])];
  let outward = 0;
  let zero = 0;
  for (const [doc, sign] of signed) {
    if (zeroRatedDoc(doc)) zero += sign * cessOf(doc);
    else outward += sign * cessOf(doc);
  }
  let input = 0;
  let ineligible = 0;
  for (const bill of docs.purchases || []) {
    if (bill.itcEligible === false) ineligible += cessOf(bill);
    else input += cessOf(bill);
  }
  for (const note of docs.purchaseNotes || []) {
    if (note.itcEligible === false) ineligible -= cessOf(note);
    else input -= cessOf(note);
  }
  return { outward: r2(outward), zero: r2(zero), output: r2(outward + zero), input: r2(input), ineligible: r2(ineligible) };
}

function savesOf(state) {
  if (!state.gstr3bPortal || typeof state.gstr3bPortal !== 'object') state.gstr3bPortal = {};
  return state.gstr3bPortal;
}

function lineSupply(line) {
  return String(line?.supply || '');
}

function exportsAndNonGst(docs) {
  const zero = { txval: 0, iamt: 0 };
  const fromRated = { txval: 0, iamt: 0 };
  let fromNil = 0;
  let nonGst = 0;
  const signed = [...(docs.invoices || []).map((doc) => [doc, 1]), ...(docs.debitNotes || []).map((doc) => [doc, 1]), ...(docs.creditNotes || []).map((doc) => [doc, -1])];
  for (const [inv, sign] of signed) {
    const exported = zeroRatedDoc(inv);
    for (const line of inv.lines || []) {
      const taxable = sign * Number(line.taxable || 0);
      const igst = sign * Number(line.igst || 0);
      if (exported) {
        zero.txval += taxable;
        zero.iamt += igst;
        if (Number(line.gstRate || 0) === 0) fromNil += taxable;
        else { fromRated.txval += taxable; fromRated.iamt += igst; }
        continue;
      }
      if (lineSupply(line) === 'non-gst') nonGst += taxable;
    }
  }
  return { zero, fromRated, fromNil, nonGst };
}

function unregisteredInterState(invoices, homeState) {
  const byPos = new Map();
  for (const inv of invoices) {
    if (String(inv.partyGstin || '').trim()) continue;
    if (inv.export || String(inv.placeOfSupply || '') === '96') continue;
    const pos = String(inv.placeOfSupply || inv.partyState || '').padStart(2, '0');
    if (!pos || pos === String(homeState).padStart(2, '0')) continue;
    if (!Number(inv.igst || 0)) continue;
    const row = byPos.get(pos) || { pos, txval: 0, iamt: 0 };
    row.txval += Number(inv.taxable || 0);
    row.iamt += Number(inv.igst || 0);
    byPos.set(pos, row);
  }
  return [...byPos.values()].sort((a, b) => a.pos.localeCompare(b.pos)).map((row) => ({ pos: row.pos, txval: r2(row.txval), iamt: r2(row.iamt) }));
}

export function gstr3bPortalJson(state, period, gstin) {
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const regd = regArg(state, gstin);
  if (!regd.ok) return regd;
  const docs = documentsForPeriod(state, period, '', regd.gstin);
  if (!docs.ok) return docs;
  const company = companyAs(state, regd.gstin);
  if (!company.gstin) return fail('GSTIN_REQUIRED', { hint: 'Add the business GSTIN first.' });
  const draft = gstr3bFor(state, docs);
  const totals = draft.outward?.totals || {};
  const extra = exportsAndNonGst(docs);
  const warnings = [];
  if (draft.missingHsn?.length) warnings.push(`Invoices without an HSN are counted in the totals: ${draft.missingHsn.join(', ')}.`);
  const cess = cessTotals(docs);
  const outward = amounts(Number(totals.interTaxable || 0) + Number(totals.intraTaxable || 0) - extra.fromRated.txval, Number(totals.interIgst || 0) - extra.fromRated.iamt, totals.intraCgst, totals.intraSgst, cess.outward);
  const nilExempt = Math.max(0, Number(draft.outward?.nilExemptTaxable || 0) - extra.fromNil - extra.nonGst);
  const itc = draft.itc || {};
  const available = itc.available || {};
  const ineligible = itc.ineligible || {};
  const rcm = reverseChargeTotals(docs.purchases);
  const importServices = rcm.eligibleImport.igst;
  const otherRcm = rcm.eligibleOther;
  const others = taxOnly(Number(available.igst || 0) - importServices - otherRcm.igst, Number(available.cgst || 0) - otherRcm.cgst, Number(available.sgst || 0) - otherRcm.sgst, cess.input);
  const net = taxOnly(available.igst, available.cgst, available.sgst, cess.input);
  const payment = paymentFor(state, docs.period, { gstin: regd.gstin });
  const late = payment.ok ? payment.data.late : null;
  const interest = late?.interest ? late.interest : 0;
  const cash = cashWithReverseCharge(payment.ok ? payment.data : null);
  const cashTotal = Number(cash.igst || 0) + Number(cash.cgst || 0) + Number(cash.sgst || 0);
  const share = (head) => (cashTotal > 0 ? r2(interest * Number(cash[head] || 0) / cashTotal) : 0);
  const body = {
    gstin: company.gstin,
    ret_period: fpOf(docs.period),
    sup_details: {
      osup_det: outward,
      osup_zero: amounts(extra.zero.txval, extra.zero.iamt, 0, 0, cess.zero),
      osup_nil_exmp: { txval: r2(nilExempt) },
      isup_rev: amounts(rcm.taxable, rcm.igst, rcm.cgst, rcm.sgst),
      osup_nongst: { txval: r2(extra.nonGst) },
    },
    inter_sup: {
      unreg_details: unregisteredInterState(docs.invoices, company.state),
      comp_details: [],
      uin_details: [],
    },
    itc_elg: {
      itc_avl: [
        { ty: 'IMPG', ...taxOnly(0, 0, 0) },
        { ty: 'IMPS', ...taxOnly(importServices, 0, 0) },
        { ty: 'ISRC', ...taxOnly(otherRcm.igst, otherRcm.cgst, otherRcm.sgst) },
        { ty: 'ISD', ...taxOnly(0, 0, 0) },
        { ty: 'OTH', ...others },
      ],
      itc_rev: [
        { ty: 'RUL', ...taxOnly(0, 0, 0) },
        { ty: 'OTH', ...taxOnly(0, 0, 0) },
      ],
      itc_net: net,
      itc_inelg: [
        { ty: 'RUL', ...taxOnly(ineligible.igst, ineligible.cgst, ineligible.sgst, cess.ineligible) },
        { ty: 'OTH', ...taxOnly(0, 0, 0) },
      ],
    },
    inward_sup: {
      isup_details: [
        { ty: 'GST', inter: 0, intra: 0 },
        { ty: 'NONGST', inter: 0, intra: 0 },
      ],
    },
    intr_ltfee: { intr_details: taxOnly(share('igst'), share('cgst'), share('sgst')) },
  };
  if (interest > 0) warnings.push(`Interest of ₹${r2(interest)} for paying late is included.`);
  if (!payment.ok) warnings.push('The tax to pay could not be worked out, so no interest is included.');
  else if (payment.data.broughtForwardKnown === false) warnings.push('Credit carried from earlier months is not known to MyCA; check the electronic credit ledger on the portal.');
  if (rcm.count) warnings.push(`Reverse charge tax of ₹${rcm.total} on ${rcm.count} ${rcm.count === 1 ? 'purchase' : 'purchases'} is in 3.1(d) and must be paid in cash; its credit is in 4(A)(2) and 4(A)(3).`);
  if (cess.output || cess.input) warnings.push(`Compensation cess: ₹${cess.output} on supplies and ₹${cess.input} of cess credit; cess credit can be used only against cess.`);
  warnings.push(cess.output || cess.input ? 'Imports of goods, ISD credit and credit reversals are not in the books, so those rows are zero.' : 'Imports of goods, ISD credit, credit reversals and cess are not in the books, so those rows are zero.');
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { ok: true, period: docs.period, gstin: company.gstin, body, hash, warnings, payment: payment.ok ? payment.data : null, cess };
}

function foundSave(state, args) {
  const period = String(args.period || '').trim();
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const regd = regArg(state, args.gstin);
  if (!regd.ok) return regd;
  const saved = savesOf(state)[scopeKey(state, period, regd.gstin)];
  if (!saved) return fail('NOT_SAVED', { hint: 'Save the GSTR-3B to the portal first, then set off the tax and file it.' });
  return { ok: true, period, gstin: regd.gstin, saved };
}

function sameDraft(state, found) {
  const built = gstr3bPortalJson(state, found.period, found.gstin);
  if (!built.ok) return built;
  if (built.hash !== found.saved.draftHash) return fail('DRAFT_CHANGED', { hint: 'The books changed since the GSTR-3B was saved; save it again.' });
  return built;
}

function approvedReview(state, period, gstin) {
  const review = reviewOf(state, period, gstin);
  if (!review.ok) return review;
  if (!review.data.approved) return fail('REVIEW_NOT_APPROVED', { hint: 'Approve the GST review for the month first; paying and filing cannot be undone.' });
  return { ok: true };
}

export function gstr3bSubject(operationId, fields) {
  return { operationId, ...fields };
}

function op(state, actor, args, operationId, params, payloadSummary, subject) {
  return runSandboxOperation({
    operationId,
    actorId: actor?.userId || 'owner',
    actor,
    caApprovalId: args.caApprovalId || '',
    ...(subject ? { approvalSubject: gstr3bSubject(operationId, subject) } : {}),
    params,
    payloadSummary,
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
}

export async function saveGstr3bToPortal(state, args = {}, actor) {
  const built = gstr3bPortalJson(state, String(args.period || '').trim(), args.gstin);
  if (!built.ok) return built;
  if (filingFor(state, 'GSTR-3B', built.period, built.gstin)) return fail('ALREADY_FILED', { hint: 'The GSTR-3B for this month is already recorded as filed.' });
  const out = await op(state, actor, args, 'gst_save_gstr3b', { period: built.period, payload: built.body }, { period: built.period, gstin: built.gstin, draftHash: built.hash }, { period: built.period, gstin: built.gstin, draftHash: built.hash });
  if (!out.ok) return { ...out, period: built.period, gstin: built.gstin };
  const record = { period: built.period, gstin: built.gstin, draftHash: built.hash, savedOn: localToday(), referenceId: String(out.data?.referenceId || ''), warnings: built.warnings, mock: Boolean(out.mock) };
  savesOf(state)[scopeKey(state, built.period, built.gstin)] = record;
  return { ok: true, save: record, sections: { outward: built.body.sup_details.osup_det, credit: built.body.itc_elg.itc_net }, mock: Boolean(out.mock) };
}

export async function gstr3bPortalLiability(state, args = {}, actor) {
  const found = foundSave(state, args);
  if (!found.ok) return found;
  const out = await op(state, actor, args, 'gst_gstr3b_liability', { period: found.period }, { period: found.period, gstin: found.gstin });
  if (!out.ok) return { ...out, period: found.period, gstin: found.gstin };
  found.saved.liability = out.data?.liability || null;
  found.saved.ledgerIds = out.data?.ledgerIds || {};
  found.saved.liabilityOn = localToday();
  return { ok: true, period: found.period, gstin: found.gstin, liability: found.saved.liability, mock: Boolean(out.mock) };
}

function cashWithReverseCharge(payment) {
  const cash = payment?.cash || {};
  const rcm = payment?.reverseCharge || {};
  return { igst: Number(cash.igst || 0) + Number(rcm.igst || 0), cgst: Number(cash.cgst || 0) + Number(rcm.cgst || 0), sgst: Number(cash.sgst || 0) + Number(rcm.sgst || 0) };
}

export function offsetPlan(payment, ledgerIds = {}, cess = {}) {
  const cessCredit = r2(Math.max(0, Math.min(Number(cess.input || 0), Number(cess.output || 0))));
  const cessCash = r2(Math.max(0, Number(cess.output || 0) - cessCredit));
  const used = payment.used || {};
  const cash = payment.cash || {};
  const rcm = payment.reverseCharge || {};
  const late = payment.late || null;
  const interest = Number(late?.interest || 0);
  const all = cashWithReverseCharge(payment);
  const cashTotal = all.igst + all.cgst + all.sgst;
  const share = (row, head) => (cashTotal > 0 ? r2(interest * Number(row[head] || 0) / cashTotal) : 0);
  const fee = r2(Number(late?.lateFee || 0) / 2);
  const ledger = (type) => Number(ledgerIds[type] || 0);
  const rcmTotal = Number(rcm.igst || 0) + Number(rcm.cgst || 0) + Number(rcm.sgst || 0);
  const cashRow = (type, row, lateFee, cessPaid = 0) => ({ liab_ldg_id: ledger(type), trans_typ: type, ipd: r2(row.igst), cpd: r2(row.cgst), spd: r2(row.sgst), cspd: cessPaid, i_intrpd: share(row, 'igst'), c_intrpd: share(row, 'cgst'), s_intrpd: share(row, 'sgst'), cs_intrpd: 0, c_lfeepd: lateFee, s_lfeepd: lateFee });
  return {
    pdcash: [
      cashRow(TAX, cash, fee, cessCash),
      ...(rcmTotal > 0 ? [cashRow(REVERSE_CHARGE, rcm, 0)] : []),
    ],
    pditc: {
      liab_ldg_id: ledger(TAX),
      trans_typ: TAX,
      i_pdi: r2(used.igst?.igst), i_pdc: r2(used.igst?.cgst), i_pds: r2(used.igst?.sgst),
      c_pdi: r2(used.cgst?.igst), c_pdc: r2(used.cgst?.cgst),
      s_pdi: r2(used.sgst?.igst), s_pds: r2(used.sgst?.sgst),
      cs_pdcs: cessCredit,
    },
  };
}

export async function offsetGstr3bOnPortal(state, args = {}, actor) {
  const found = foundSave(state, args);
  if (!found.ok) return found;
  if (found.saved.offsetOn) return fail('ALREADY_SET_OFF', { hint: 'The tax for this month was already set off on the portal; file the return next.' });
  const built = sameDraft(state, found);
  if (!built.ok) return built;
  const review = approvedReview(state, found.period, found.gstin);
  if (!review.ok) return review;
  if (!built.payment) return fail('PAYMENT_UNKNOWN', { hint: 'MyCA could not work out the tax to pay for the month.' });
  const plan = offsetPlan(built.payment, found.saved.ledgerIds || {}, built.cess);
  const cashNeeded = r2(plan.pdcash.reduce((sum, row) => sum + row.ipd + row.cpd + row.spd + row.cspd + row.i_intrpd + row.c_intrpd + row.s_intrpd + row.c_lfeepd + row.s_lfeepd, 0));
  const out = await op(state, actor, args, 'gst_gstr3b_offset', { period: found.period, payload: plan }, { period: found.period, gstin: found.gstin, draftHash: found.saved.draftHash, cash: cashNeeded }, { period: found.period, gstin: found.gstin, draftHash: found.saved.draftHash });
  if (!out.ok) return { ...out, period: found.period, gstin: found.gstin, cashNeeded, hint: out.hint || (cashNeeded > 0 ? `The cash ledger needs ₹${cashNeeded}; pay it by challan (PMT-06) first.` : '') };
  found.saved.offsetOn = localToday();
  found.saved.offset = { cash: cashNeeded, creditUsed: r2(built.payment.creditUsed) };
  return { ok: true, period: found.period, gstin: found.gstin, cashPaid: cashNeeded, creditUsed: r2(built.payment.creditUsed), message: String(out.data?.message || ''), mock: Boolean(out.mock) };
}

export async function requestGstr3bEvc(state, args = {}, actor) {
  const found = foundSave(state, args);
  if (!found.ok) return found;
  const pan = String(args.pan || state.company?.pan || '').trim().toUpperCase();
  if (!PAN.test(pan)) return fail('PAN_REQUIRED', { hint: 'Add the PAN of the authorised signatory to the company details.' });
  const out = await op(state, actor, args, 'gst_evc_otp', { pan, gstr: 'gstr-3b' }, { period: found.period, gstin: found.gstin, form: 'GSTR-3B' }, { form: 'GSTR-3B', period: found.period, gstin: found.gstin });
  if (!out.ok) return { ...out, period: found.period, gstin: found.gstin };
  return { ok: true, period: found.period, gstin: found.gstin, sent: true, mock: Boolean(out.mock) };
}

export async function fileGstr3bOnPortal(state, args = {}, actor) {
  const found = foundSave(state, args);
  if (!found.ok) return found;
  if (found.saved.filedAck && !found.saved.filedMock) return fail('ALREADY_FILED', { ackNum: found.saved.filedAck });
  const built = sameDraft(state, found);
  if (!built.ok) return built;
  const review = approvedReview(state, found.period, found.gstin);
  if (!review.ok) return review;
  const cashOwed = (built.payment ? Number(built.payment.cash?.total || 0) + Number(built.payment.reverseCharge?.total || 0) + Number(built.payment.creditUsed || 0) : 0) + Number(built.cess?.output || 0);
  if (!found.saved.offsetOn && cashOwed > 0) return fail('NOT_SET_OFF', { hint: 'Set off the tax on the portal first ("pay GSTR-3B for 2026-09 on the portal").' });
  const pan = String(args.pan || state.company?.pan || '').trim().toUpperCase();
  if (!PAN.test(pan)) return fail('PAN_REQUIRED');
  const otp = String(args.otp || '').trim();
  if (!/^\d{6}$/.test(otp)) return fail('OTP_REQUIRED', { hint: 'Enter the six-digit EVC OTP the portal sent.' });
  const out = await op(state, actor, args, 'gst_file_gstr3b_evc', { period: found.period, pan, otp, payload: built.body }, { period: found.period, gstin: found.gstin, draftHash: found.saved.draftHash }, { period: found.period, gstin: found.gstin, draftHash: found.saved.draftHash });
  if (!out.ok) return { ...out, period: found.period, gstin: found.gstin };
  const ackNum = String(out.data?.ackNum || '').toUpperCase();
  let filing = null;
  if (!out.mock && ARN.test(ackNum)) {
    const recorded = recordFiling(state, { returnType: 'GSTR-3B', period: found.period, arn: ackNum, filedOn: localToday(), filedBy: 'portal', gstin: found.gstin }, filingRows(state, localToday()));
    if (recorded.ok) filing = recorded.filing;
  }
  found.saved.filedAck = ackNum;
  found.saved.filedOn = localToday();
  found.saved.filedMock = Boolean(out.mock);
  return { ok: true, period: found.period, gstin: found.gstin, ackNum, filing, mock: Boolean(out.mock) };
}

export function gstr3bPortalStatus(state) {
  return Object.values(savesOf(state)).sort((a, b) => a.period.localeCompare(b.period) || a.gstin.localeCompare(b.gstin));
}

export function gstr3bPortalWords(name, result) {
  const sim = result.mock ? 'Simulated: ' : '';
  if (name === 'save_gstr3b_portal') {
    const out = result.sections?.outward || {};
    const credit = result.sections?.credit || {};
    const warn = (result.save.warnings || []).map((line) => `\n· ${line}`).join('');
    return `${sim}GSTR-3B for ${result.save.period} (${result.save.gstin}) saved to the portal: outward taxable ₹${out.txval}, tax ₹${r2(out.iamt + out.camt + out.samt)}, credit ₹${r2(credit.iamt + credit.camt + credit.samt)}.${warn}\nNext: approve the GST review, pay any cash by challan, then "pay GSTR-3B for ${result.save.period} on the portal".`;
  }
  if (name === 'offset_gstr3b_portal') return `${sim}GSTR-3B tax for ${result.period} set off on the portal: ₹${result.creditUsed} from credit and ₹${result.cashPaid} from cash.${result.message ? ` The portal said: ${result.message}` : ''} Next: ask for the EVC OTP and file.`;
  if (name === 'file_gstr3b_portal') return `${sim}GSTR-3B for ${result.period} filed${result.ackNum ? `, acknowledgement ${result.ackNum}` : ''}.${result.filing ? ' Recorded as filed.' : result.mock ? ' Nothing was sent and nothing is marked as filed.' : ''}`;
  return '';
}
