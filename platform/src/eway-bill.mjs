import { rules } from './sprint-load.mjs';
import { partyStateOf } from './chart.mjs';
import { localToday } from './dates.mjs';

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
  const supplierState = String(company.state || '');
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
    status: generated ? 'generated' : !need.needed ? 'not-needed' : !transport ? 'transport-needed' : !invoice?.irn ? 'irn-needed' : 'ready',
  };
}

export function transportPayload(transport) {
  return {
    Distance: transport.distanceKm,
    TransMode: MODES[transport.mode],
    ...(transport.transporterId ? { TransId: transport.transporterId } : {}),
    ...(transport.transporterName ? { TransName: transport.transporterName } : {}),
    ...(transport.docNo ? { TransDocNo: transport.docNo } : {}),
    ...(transport.vehicleNo ? { VehNo: transport.vehicleNo, VehType: 'R' } : {}),
  };
}

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
