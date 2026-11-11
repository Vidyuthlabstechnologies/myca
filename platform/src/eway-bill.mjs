import { rules } from './sprint-load.mjs';
import { partyStateOf } from './chart.mjs';
import { localToday } from './dates.mjs';
import { invoiceToNicPayload, nicPartyFor } from './nic-config.mjs';

const THRESHOLD = 'gst.ewaybill.threshold';
const VEHICLE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
const TRANSPORTER_ID = /^[0-9]{2}[A-Z0-9]{13}$/;
const MODES = { road: '1', rail: '2', air: '3', ship: '4' };
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function isService(line) {
  return String(line?.hsn || '').trim().startsWith('99');
}

export function ewayBillNeed(state, invoice) {
  if (!invoice || invoice.status === 'cancelled') return { needed: false, why: 'The invoice is cancelled.' };
  const found = rules.rule(THRESHOLD, invoice.date);
  if (!found.ok) return { needed: false, error: 'GST_RULE_MISSING', ruleId: THRESHOLD, why: 'The e-way bill threshold rule is not in force for this date.' };
  const threshold = found.record.value.consignmentValuePaiseMoreThan / 100;
  const ruleUsed = `${found.record.id}@${found.record.effectiveFrom}`;
  const attested = (found.record.attestations || []).length > 0;
  const company = state.company || {};
  const goodsLines = (invoice.lines || []).filter((line) => !isService(line));
  const unknownLines = goodsLines.filter((line) => !String(line.hsn || '').trim()).length;
  const value = round2(Number(invoice.total || 0));
  const supplierState = String(invoice.registrationState || company.state || '');
  const placeOfSupply = String(invoice.placeOfSupply || invoice.partyState || partyStateOf(invoice.partyGstin) || supplierState);
  const interState = Boolean(supplierState && placeOfSupply && supplierState !== placeOfSupply);
  const base = { threshold, value, interState, ruleUsed, attested, goodsLines: goodsLines.length, unknownLines };
  if (!goodsLines.length) return { ...base, needed: false, why: 'Every line is a service (SAC starting 99), so no goods move.' };
  if (value <= threshold) return { ...base, needed: false, why: `The consignment value ${money(value)} is not above ${money(threshold)}.` };
  const why = [
    `Goods worth ${money(value)} move ${interState ? 'to another state' : 'within the state'}, above the ${money(threshold)} limit.`,
    unknownLines ? `${unknownLines === 1 ? '1 line has' : `${unknownLines} lines have`} no HSN, so ${unknownLines === 1 ? 'it is' : 'they are'} counted as goods.` : '',
    !interState ? 'Some states set a higher limit for movement within the state; MyCA applies the central limit.' : '',
    attested ? '' : 'The limit comes from a dated rule your CA has not reviewed yet.',
  ].filter(Boolean).join(' ');
  return { ...base, needed: true, why };
}

export function planTransport(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
  if (!invoice) return fail('INVOICE_NOT_FOUND', { invoiceId });
  if (invoice.status === 'cancelled') return fail('INVOICE_CANCELLED', { invoiceId });
  const mode = String(args.mode || 'road').trim().toLowerCase();
  if (!MODES[mode]) return fail('BAD_MODE', { mode });
  const vehicleNo = String(args.vehicleNo || '').replace(/[\s-]+/g, '').toUpperCase();
  if (mode === 'road' && !vehicleNo) return fail('VEHICLE_REQUIRED');
  if (vehicleNo && !VEHICLE.test(vehicleNo)) return fail('BAD_VEHICLE', { vehicleNo });
  const distanceKm = Number(args.distanceKm);
  if (!Number.isInteger(distanceKm) || distanceKm < 1 || distanceKm > 4000) return fail('BAD_DISTANCE');
  const transporterName = String(args.transporterName || '').trim().slice(0, 100);
  const transporterId = String(args.transporterId || '').replace(/\s+/g, '').toUpperCase();
  if (transporterId && !TRANSPORTER_ID.test(transporterId)) return fail('BAD_TRANSPORTER_ID', { transporterId });
  const docNo = String(args.docNo || '').trim().slice(0, 15);
  if (mode !== 'road' && !docNo) return fail('DOC_REQUIRED', { mode });
  return { ok: true, transport: { mode, vehicleNo, distanceKm, transporterName, transporterId, docNo, setOn: localToday() }, invoice, was: invoice.transport || null };
}

export function setTransport(state, args = {}) {
  const plan = planTransport(state, args);
  if (!plan.ok) return plan;
  plan.invoice.transport = plan.transport;
  return { ok: true, invoiceId: plan.invoice.id, transport: plan.transport, was: plan.was, need: ewayBillNeed(state, plan.invoice) };
}

export function ewayBillStatus(state, invoice) {
  const need = ewayBillNeed(state, invoice);
  const transport = invoice?.transport || null;
  const generated = Boolean(invoice?.ewbNo);
  return {
    ...need,
    transport,
    hasTransport: Boolean(transport),
    hasIrn: Boolean(invoice?.irn),
    ewbNo: invoice?.ewbNo || '',
    ewbValidity: invoice?.ewbValidity || '',
    ...(invoice?.sandboxEwb?.ewbNo && !invoice.sandboxEwb.cancelledOn ? { sandboxEwbNo: invoice.sandboxEwb.ewbNo } : {}),
    ewbCancelled: (invoice?.ewbHistory || []).filter((item) => item.cancelledOn).map((item) => ({ ewbNo: item.ewbNo, cancelledOn: item.cancelledOn })),
    via: invoice?.irn ? 'irn' : 'invoice',
    status: generated ? 'generated' : !need.needed ? 'not-needed' : !transport ? 'transport-needed' : 'ready',
  };
}

export function transportPayload(transport) {
  return {
    Distance: transport.distanceKm,
    TransMode: MODES[transport.mode],
    ...(transport.transporterId ? { TransId: transport.transporterId } : {}),
    ...(transport.transporterName ? { TransName: transport.transporterName } : {}),
    ...(transport.docNo ? { TransDocNo: transport.docNo, TransDocDt: ewbDate(transport.docDate || transport.setOn) } : {}),
    ...(transport.vehicleNo ? { VehNo: transport.vehicleNo, VehType: 'R' } : {}),
  };
}

// dd/mm/yyyy, the date format of the e-way bill system.
export function ewbDate(iso) {
  const parts = String(iso || '').slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(iso || '');
}

const EXPORT_STATE = 99;

function stateCode(value) {
  const code = Number(value);
  if (code === 96) return EXPORT_STATE;
  return Number.isInteger(code) && code > 0 ? code : 0;
}

function clean(text, max) {
  return String(text || '').replace(/[^A-Za-z0-9 #,\-/.&()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Part A (and Part B when a vehicle is known) of a standalone e-way bill built from a
// posted invoice, for invoices with no IRN. Field names follow the e-way bill API.
export function ewayBillPartA(state, invoice) {
  if (!invoice) return fail('INVOICE_NOT_FOUND');
  const transport = invoice.transport;
  if (!transport) return fail('TRANSPORT_REQUIRED');
  const company = state.company || {};
  const nic = invoiceToNicPayload(company, invoice, nicPartyFor(state, invoice));
  const seller = nic.SellerDtls;
  const buyer = nic.BuyerDtls;
  const exported = Boolean(invoice.export);
  const problems = [];
  if (!/^[0-9]{2}[0-9A-Z]{13}$/.test(String(seller.Gstin || ''))) problems.push('SELLER_GSTIN');
  if (!seller.Pin) problems.push('SELLER_PIN');
  if (!exported && !buyer.Pin) problems.push('BUYER_PIN');
  if (!stateCode(seller.Stcd)) problems.push('SELLER_STATE');
  if (!stateCode(buyer.Stcd)) problems.push('BUYER_STATE');
  if (problems.length) {
    return fail('EWB_DETAILS_MISSING', {
      problems,
      hint: [
        problems.includes('SELLER_GSTIN') ? 'Add the business GSTIN.' : '',
        problems.includes('SELLER_PIN') ? 'Add the business PIN code (set_business_address).' : '',
        problems.includes('BUYER_PIN') ? `Add ${invoice.partyName || 'the customer'}'s address with its PIN code (set_party_address).` : '',
        problems.includes('SELLER_STATE') || problems.includes('BUYER_STATE') ? 'The state of supply is not known.' : '',
      ].filter(Boolean).join(' '),
    });
  }
  const goods = (invoice.lines || []).filter((line) => !isService(line));
  const itemList = goods.map((line) => {
    const rate = Number(line.gstRate || 0);
    const inter = Number(line.igst || 0) > 0 || (Number(line.cgst || 0) === 0 && Number(line.sgst || 0) === 0 && Number(invoice.igst || 0) > 0);
    return {
      productName: clean(line.description || line.item || 'Goods', 100) || 'Goods',
      productDesc: clean(line.description || '', 100),
      hsnCode: Number(String(line.hsn || '').replace(/\D/g, '')) || undefined,
      quantity: Number(line.qty || 1),
      qtyUnit: String(line.unit || 'NOS').toUpperCase().slice(0, 3),
      taxableAmount: round2(line.taxable),
      igstRate: inter ? rate : 0,
      cgstRate: inter ? 0 : rate / 2,
      sgstRate: inter ? 0 : rate / 2,
      cessRate: 0,
      cessNonadvol: 0,
    };
  });
  const taxable = round2(invoice.taxable);
  const cgst = round2(invoice.cgst);
  const sgst = round2(invoice.sgst);
  const igst = round2(invoice.igst);
  const total = round2(invoice.total);
  const other = round2(total - taxable - cgst - sgst - igst);
  const fromState = stateCode(seller.Stcd);
  const toState = exported ? EXPORT_STATE : stateCode(buyer.Stcd);
  const partA = {
    supplyType: 'O',
    subSupplyType: exported ? '3' : '1',
    subSupplyDesc: '',
    docType: 'INV',
    docNo: String(invoice.id).slice(0, 16),
    docDate: ewbDate(invoice.date),
    fromGstin: String(seller.Gstin),
    fromTrdName: clean(company.tradeName || company.name, 100),
    fromAddr1: clean(seller.Addr1, 120),
    fromAddr2: '',
    fromPlace: clean(seller.Loc, 50),
    fromPincode: Number(seller.Pin),
    actFromStateCode: fromState,
    fromStateCode: fromState,
    toGstin: exported ? 'URP' : String(buyer.Gstin || 'URP'),
    toTrdName: clean(invoice.partyName, 100),
    toAddr1: clean(buyer.Addr1, 120),
    toAddr2: '',
    toPlace: clean(buyer.Loc, 50),
    toPincode: exported ? 999999 : Number(buyer.Pin),
    actToStateCode: toState,
    toStateCode: toState,
    transactionType: 1,
    totalValue: taxable,
    cgstValue: cgst,
    sgstValue: sgst,
    igstValue: igst,
    cessValue: 0,
    cessNonAdvolValue: 0,
    otherValue: other,
    totInvValue: total,
    transMode: MODES[transport.mode],
    transDistance: String(transport.distanceKm),
    ...(transport.transporterName ? { transporterName: clean(transport.transporterName, 100) } : {}),
    ...(transport.transporterId ? { transporterId: transport.transporterId } : {}),
    ...(transport.docNo ? { transDocNo: transport.docNo, transDocDate: ewbDate(transport.docDate || transport.setOn) } : {}),
    ...(transport.vehicleNo ? { vehicleNo: transport.vehicleNo, vehicleType: 'R' } : {}),
    itemList,
  };
  return { ok: true, partA };
}

// The e-way bill number, date and validity from either API's answer.
export function ewbResult(data = {}) {
  const inner = data?.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data;
  const fromIrp = inner?.Data || null;
  const raw = fromIrp || inner || {};
  const ewbNo = String(raw.EwbNo ?? raw.ewayBillNo ?? raw.ewbNo ?? '').trim();
  return {
    ewbNo,
    ewbDate: String(raw.EwbDt ?? raw.ewayBillDate ?? ''),
    ewbValidity: String(raw.EwbValidTill ?? raw.validUpto ?? '').trim(),
    alert: String(raw.alert || inner?.alert || '').trim(),
  };
}

export function findEwbInvoice(state, { invoiceId, ewbNo } = {}) {
  const invoices = state?.invoices || [];
  if (invoiceId) return invoices.find((item) => item.id === String(invoiceId).trim().toUpperCase()) || null;
  if (ewbNo) return invoices.find((item) => String(item.ewbNo || '') === String(ewbNo).trim()) || null;
  return null;
}

export const EWB_REASONS = Object.freeze({
  cancel: Object.freeze({ 1: 'Duplicate', 2: 'Order cancelled', 3: 'Data entry mistake', 4: 'Others' }),
  vehicle: Object.freeze({ 1: 'Due to break down', 2: 'Due to transhipment', 3: 'Others', 4: 'First time' }),
  extend: Object.freeze({ 1: 'Natural calamity', 2: 'Law and order', 4: 'Transhipment', 5: 'Accident', 99: 'Others' }),
});

export const EWB_TRANSPORT_MODES = MODES;

export function transportWords(transport) {
  const by = { road: 'by road', rail: 'by rail', air: 'by air', ship: 'by ship' }[transport.mode];
  return [
    `${transport.distanceKm} km ${by}`,
    transport.vehicleNo ? `vehicle ${transport.vehicleNo}` : '',
    transport.transporterName ? `transporter ${transport.transporterName}` : '',
    transport.transporterId ? `(${transport.transporterId})` : '',
    transport.docNo ? `document ${transport.docNo}` : '',
  ].filter(Boolean).join(', ');
}

export function recordShare(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = [...(state.invoices || []), ...(state.quotes || [])].find((item) => item.id === invoiceId);
  if (!invoice) return fail('INVOICE_NOT_FOUND', { invoiceId });
  const outcome = String(args.outcome || 'shared').toLowerCase();
  if (!['shared', 'printed', 'cancelled'].includes(outcome)) return fail('BAD_OUTCOME', { outcome });
  if (outcome === 'cancelled') return { ok: true, invoiceId, recorded: false };
  const channel = String(args.channel || 'share_sheet').toLowerCase().slice(0, 40);
  const actor = state.__actor;
  const share = { on: new Date().toISOString(), by: String(actor?.userId || args.actorId || ''), channel, outcome, ...(args.to ? { to: String(args.to).slice(0, 120) } : {}) };
  invoice.shares = [...(invoice.shares || []), share];
  return { ok: true, invoiceId, recorded: true, share, count: invoice.shares.length };
}

function money(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
