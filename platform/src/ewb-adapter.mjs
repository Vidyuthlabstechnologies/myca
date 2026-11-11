// E-way bill operations on Sandbox by Quicko (GSP). Each operation has a request builder
// (checks the input and shapes the API body before the action gate runs), a live adapter
// (calls the scoped Sandbox transport and records the outcome on the invoice) and a mock
// adapter (a tagged simulation for MYCA_MOCK_MODE). NIC direct access needs a turnover of
// 100 crore rupees or more, so MyCA reaches the e-way bill system only through the GSP.

import { EWB_REASONS, EWB_TRANSPORT_MODES, ewayBillPartA, ewbDate, ewbResult, findEwbInvoice, transportPayload } from './eway-bill.mjs';

const EWB_NO = /^[0-9]{12}$/;
const VEHICLE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$|^TM[A-Z0-9]{6}$/;
const TRANSPORTER_ID = /^[0-9]{2}[A-Z0-9]{13}$/;
const DDMMYYYY = /^[0-3][0-9]\/[0-1][0-9]\/20[0-9]{2}$/;
const MOCK_TAG = { mock: true, simulated: true };

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function upper(value) {
  return String(value ?? '').replace(/[\s-]+/g, '').toUpperCase();
}

function dateArg(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ewbDate(raw);
  return raw;
}

function modeArg(value, fallback = '1') {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (Object.hasOwn(EWB_TRANSPORT_MODES, raw)) return EWB_TRANSPORT_MODES[raw];
  if (['1', '2', '3', '4', '5'].includes(raw)) return raw;
  return '';
}

function stateArg(value) {
  const code = Number(value);
  return Number.isInteger(code) && code >= 1 && code <= 99 ? code : 0;
}

// The e-way bill an operation acts on: a 12-digit number, or the one recorded on an invoice.
function targetOf(state, params) {
  const invoice = findEwbInvoice(state, { invoiceId: params.invoiceId, ewbNo: params.ewbNo });
  if (params.invoiceId && !invoice) return fail('INVOICE_NOT_FOUND', { invoiceId: params.invoiceId });
  const ewbNo = String(params.ewbNo || invoice?.ewbNo || '').trim();
  if (!ewbNo) return fail('EWB_NO_REQUIRED', { hint: 'Pass the 12-digit e-way bill number, or the invoice that has one.' });
  if (!EWB_NO.test(ewbNo)) return fail('BAD_EWB_NO', { ewbNo });
  return { ok: true, ewbNo, invoice };
}

function reasonArg(kind, value) {
  const code = Number(value);
  return Object.hasOwn(EWB_REASONS[kind], code) ? code : 0;
}

function placeArgs(params, { requireVehicle = false } = {}) {
  const fromPlace = text(params.fromPlace, 50);
  const fromState = stateArg(params.fromState);
  if (!fromPlace) return fail('FROM_PLACE_REQUIRED');
  if (!fromState) return fail('BAD_FROM_STATE', { hint: 'Pass the two-digit GST state code the goods now move from.' });
  const transMode = modeArg(params.transMode ?? params.mode);
  if (!transMode) return fail('BAD_MODE');
  const vehicleNo = upper(params.vehicleNo);
  if ((requireVehicle || transMode === '1') && !vehicleNo && !params.transDocNo) return fail('VEHICLE_REQUIRED');
  if (vehicleNo && !VEHICLE.test(vehicleNo)) return fail('BAD_VEHICLE', { vehicleNo });
  const transDocNo = text(params.transDocNo ?? params.docNo, 15);
  const transDocDate = dateArg(params.transDocDate ?? params.docDate);
  if (transDocNo && !DDMMYYYY.test(transDocDate)) return fail('BAD_TRANSPORT_DOC_DATE', { hint: 'Pass the transport document date as dd/mm/yyyy.' });
  if (transMode !== '1' && transMode !== '5' && !transDocNo) return fail('DOC_REQUIRED', { mode: transMode });
  return { ok: true, fromPlace, fromState, transMode, vehicleNo, transDocNo, transDocDate };
}

// ---- request builders (run before the gate; their payload is what the audit trail keeps) ----

export const EWB_REQUEST_BUILDERS = {
  ewb_generate: ({ params, state }) => {
    const invoice = findEwbInvoice(state, { invoiceId: params.invoiceId });
    if (!invoice) return fail('INVOICE_NOT_FOUND', { invoiceId: params.invoiceId || '' });
    if (invoice.status === 'cancelled') return fail('INVOICE_CANCELLED', { invoiceId: invoice.id });
    if (invoice.ewbNo) return fail('ALREADY_GENERATED', { ewbNo: invoice.ewbNo });
    if (!invoice.transport) return fail('TRANSPORT_REQUIRED', { hint: 'Record the vehicle, distance and transporter first (set_transport).' });
    const goods = (invoice.lines || []).some((line) => !String(line?.hsn || '').trim().startsWith('99'));
    if (!goods) return fail('EWB_NOT_FOR_SERVICES', { hint: 'Every line is a service, so no goods move.' });
    const byIrn = { ...transportPayload(invoice.transport) };
    const partA = invoice.irn || invoice.sandboxIrn ? null : ewayBillPartA(state, invoice);
    if (partA && !partA.ok) return partA;
    return { ok: true, invoice, payload: partA ? { via: 'invoice', partA: partA.partA } : { via: 'irn', transport: byIrn } };
  },

  ewb_get: ({ params, state }) => {
    if (params.docNo) return { ok: true, payload: { docType: text(params.docType || 'INV', 3).toUpperCase(), docNo: text(params.docNo, 16) } };
    const invoice = params.invoiceId ? findEwbInvoice(state, { invoiceId: params.invoiceId }) : null;
    if (params.invoiceId && !invoice) return fail('INVOICE_NOT_FOUND', { invoiceId: params.invoiceId });
    if (invoice && !invoice.ewbNo && (invoice.irn || invoice.sandboxIrn)) return { ok: true, invoice, payload: { byIrn: true } };
    const target = targetOf(state, params);
    return target.ok ? { ok: true, invoice: target.invoice, payload: { ewbNo: target.ewbNo } } : target;
  },

  ewb_cancel: ({ params, state }) => {
    const target = targetOf(state, params);
    if (!target.ok) return target;
    const reasonCode = reasonArg('cancel', params.reasonCode ?? params.reason);
    if (!reasonCode) return fail('BAD_CANCEL_REASON', { reasons: EWB_REASONS.cancel });
    return { ok: true, invoice: target.invoice, payload: { ewbNo: target.ewbNo, reasonCode, remark: text(params.remark || EWB_REASONS.cancel[reasonCode], 50) } };
  },

  ewb_update_vehicle: ({ params, state }) => {
    const target = targetOf(state, params);
    if (!target.ok) return target;
    const place = placeArgs(params);
    if (!place.ok) return place;
    const reasonCode = reasonArg('vehicle', params.reasonCode ?? params.reason);
    if (!reasonCode) return fail('BAD_VEHICLE_REASON', { reasons: EWB_REASONS.vehicle });
    const vehicleType = String(params.vehicleType || 'R').toUpperCase();
    if (!['R', 'O'].includes(vehicleType)) return fail('BAD_VEHICLE_TYPE', { hint: 'R for regular, O for over-dimensional cargo.' });
    return {
      ok: true,
      invoice: target.invoice,
      payload: {
        ewbNo: target.ewbNo,
        body: {
          vehicleNo: place.vehicleNo,
          fromPlace: place.fromPlace,
          fromState: place.fromState,
          reasonCode: String(reasonCode),
          reasonRem: text(params.reasonRem || params.remark || EWB_REASONS.vehicle[reasonCode], 50),
          transDocNo: place.transDocNo,
          transDocDate: place.transDocDate,
          transMode: place.transMode,
          vehicleType,
        },
      },
    };
  },

  ewb_update_transporter: ({ params, state }) => {
    const target = targetOf(state, params);
    if (!target.ok) return target;
    const transporterId = upper(params.transporterId);
    if (!TRANSPORTER_ID.test(transporterId)) return fail('BAD_TRANSPORTER_ID', { transporterId });
    return { ok: true, invoice: target.invoice, payload: { ewbNo: target.ewbNo, transporterId } };
  },

  ewb_extend: ({ params, state }) => {
    const target = targetOf(state, params);
    if (!target.ok) return target;
    const consignmentStatus = String(params.consignmentStatus || 'M').toUpperCase();
    if (!['M', 'T'].includes(consignmentStatus)) return fail('BAD_CONSIGNMENT_STATUS', { hint: 'M when the goods are moving, T when they are in transit (in a warehouse or on the road).' });
    const place = placeArgs({ ...params, transMode: consignmentStatus === 'T' ? '5' : params.transMode ?? params.mode });
    if (!place.ok) return place;
    const remainingDistance = Number(params.remainingDistance);
    if (!Number.isInteger(remainingDistance) || remainingDistance < 1 || remainingDistance > 4000) return fail('BAD_DISTANCE', { hint: 'Pass the remaining distance in whole kilometres.' });
    const fromPincode = Number(params.fromPincode);
    if (!/^[1-9][0-9]{5}$/.test(String(params.fromPincode ?? ''))) return fail('BAD_PIN', { hint: 'Pass the PIN code of the place the goods are now at.' });
    const extnRsnCode = reasonArg('extend', params.reasonCode ?? params.reason);
    if (!extnRsnCode) return fail('BAD_EXTEND_REASON', { reasons: EWB_REASONS.extend });
    const transitType = consignmentStatus === 'T' ? String(params.transitType || 'R').toUpperCase() : '';
    if (consignmentStatus === 'T' && !['R', 'W', 'O'].includes(transitType)) return fail('BAD_TRANSIT_TYPE', { hint: 'R on road, W in a warehouse, O others.' });
    return {
      ok: true,
      invoice: target.invoice,
      payload: {
        ewbNo: target.ewbNo,
        body: {
          vehicleNo: place.vehicleNo,
          fromPlace: place.fromPlace,
          fromState: place.fromState,
          fromPincode,
          remainingDistance,
          transDocNo: place.transDocNo,
          ...(place.transDocDate ? { transDocDate: place.transDocDate } : {}),
          transMode: place.transMode,
          extnRsnCode,
          extnRemarks: text(params.remark || params.extnRemarks || EWB_REASONS.extend[extnRsnCode], 50),
          consignmentStatus,
          transitType,
          addressLine1: text(params.addressLine1, 50),
          addressLine2: text(params.addressLine2, 50),
          addressLine3: text(params.addressLine3, 50),
        },
      },
    };
  },

  ewb_consolidate: ({ params, state }) => {
    const given = Array.isArray(params.ewbNos) ? params.ewbNos : Array.isArray(params.invoiceIds) ? params.invoiceIds.map((id) => findEwbInvoice(state, { invoiceId: id })?.ewbNo || '') : [];
    const ewbNos = [...new Set(given.map((no) => String(no || '').trim()))];
    if (ewbNos.length < 2) return fail('TWO_EWBS_REQUIRED', { hint: 'A consolidated e-way bill groups two or more e-way bills carried in one vehicle.' });
    const bad = ewbNos.find((no) => !EWB_NO.test(no));
    if (bad !== undefined) return fail('BAD_EWB_NO', { ewbNo: bad });
    const place = placeArgs(params, { requireVehicle: true });
    if (!place.ok) return place;
    return {
      ok: true,
      payload: {
        fromPlace: place.fromPlace,
        fromState: place.fromState,
        vehicleNo: place.vehicleNo,
        transMode: place.transMode,
        transDocNo: place.transDocNo,
        transDocDate: place.transDocDate,
        tripSheetEwbBills: ewbNos.map((no) => ({ ewbNo: Number(no) })),
      },
    };
  },

  ewb_multi_vehicle_start: ({ params, state }) => {
    const target = targetOf(state, params);
    if (!target.ok) return target;
    const fromPlace = text(params.fromPlace, 50);
    const toPlace = text(params.toPlace, 50);
    const fromState = stateArg(params.fromState);
    const toState = stateArg(params.toState);
    if (!fromPlace || !toPlace || !fromState || !toState) return fail('PLACES_REQUIRED', { hint: 'Pass fromPlace, fromState, toPlace and toState for the leg carried in several vehicles.' });
    const transMode = modeArg(params.transMode ?? params.mode);
    if (!transMode || transMode === '5') return fail('BAD_MODE');
    const totalQuantity = Number(params.totalQuantity);
    if (!(totalQuantity > 0)) return fail('BAD_QUANTITY');
    const reasonCode = reasonArg('vehicle', params.reasonCode ?? params.reason);
    if (!reasonCode) return fail('BAD_VEHICLE_REASON', { reasons: EWB_REASONS.vehicle });
    return {
      ok: true,
      invoice: target.invoice,
      payload: {
        ewbNo: target.ewbNo,
        body: {
          fromPlace,
          fromState,
          toPlace,
          toState,
          reasonCode: String(reasonCode),
          reasonRem: text(params.reasonRem || params.remark || EWB_REASONS.vehicle[reasonCode], 50),
          transMode,
          totalQuantity,
          unitCode: text(params.unitCode || 'NOS', 3).toUpperCase(),
        },
      },
    };
  },

  ewb_multi_vehicle_add: ({ params, state }) => {
    const target = targetOf(state, params);
    if (!target.ok) return target;
    const groupNo = String(params.groupNo ?? '').trim();
    if (!/^[0-9]{1,4}$/.test(groupNo)) return fail('GROUP_REQUIRED');
    const vehicleNo = upper(params.vehicleNo);
    const transDocNo = text(params.transDocNo ?? params.docNo, 15);
    if (!vehicleNo && !transDocNo) return fail('VEHICLE_REQUIRED');
    if (vehicleNo && !VEHICLE.test(vehicleNo)) return fail('BAD_VEHICLE', { vehicleNo });
    const transDocDate = dateArg(params.transDocDate ?? params.docDate);
    if (transDocNo && !DDMMYYYY.test(transDocDate)) return fail('BAD_TRANSPORT_DOC_DATE');
    const quantity = Number(params.quantity);
    if (!(quantity > 0)) return fail('BAD_QUANTITY');
    return { ok: true, invoice: target.invoice, payload: { ewbNo: target.ewbNo, body: { groupNo, vehicleNo, transDocNo, transDocDate, quantity } } };
  },

  ewb_multi_vehicle_change: ({ params, state }) => {
    const target = targetOf(state, params);
    if (!target.ok) return target;
    const groupNo = Number(params.groupNo);
    if (!Number.isInteger(groupNo) || groupNo < 1) return fail('GROUP_REQUIRED');
    const oldvehicleNo = upper(params.oldVehicleNo);
    const newVehicleNo = upper(params.newVehicleNo);
    if (!VEHICLE.test(oldvehicleNo) || !VEHICLE.test(newVehicleNo)) return fail('BAD_VEHICLE', { hint: 'Pass oldVehicleNo and newVehicleNo.' });
    const fromPlace = text(params.fromPlace, 50);
    const fromState = stateArg(params.fromState);
    if (!fromPlace || !fromState) return fail('FROM_PLACE_REQUIRED');
    const reasonCode = reasonArg('vehicle', params.reasonCode ?? params.reason);
    if (!reasonCode) return fail('BAD_VEHICLE_REASON', { reasons: EWB_REASONS.vehicle });
    return {
      ok: true,
      invoice: target.invoice,
      payload: {
        ewbNo: target.ewbNo,
        body: {
          groupNo,
          oldvehicleNo,
          newVehicleNo,
          oldTranNo: text(params.oldTranNo, 15),
          newTranNo: text(params.newTranNo, 15),
          fromPlace,
          fromState,
          reasonCode: String(reasonCode),
          reasonRem: text(params.reasonRem || params.remark || EWB_REASONS.vehicle[reasonCode], 50),
        },
      },
    };
  },

  ewb_consignee_list: ({ params }) => {
    const date = dateArg(params.date);
    if (!DDMMYYYY.test(date)) return fail('DATE_REQUIRED', { hint: 'Pass the generation date as dd/mm/yyyy or yyyy-mm-dd (not today).' });
    return { ok: true, payload: { date } };
  },

  ewb_reject: ({ params }) => {
    const ewbNo = String(params.ewbNo || '').trim();
    if (!EWB_NO.test(ewbNo)) return fail('BAD_EWB_NO', { ewbNo });
    return { ok: true, payload: { ewbNo } };
  },
};

function build(operationId, params, state) {
  return EWB_REQUEST_BUILDERS[operationId]({ params, state });
}

function refused(res, fallback) {
  return { ok: false, error: res?.error || fallback, ...(res?.message || res?.hint ? { hint: res.message || res.hint } : {}) };
}

function inner(res) {
  return res?.data?.data?.data ?? res?.data?.data?.Data ?? res?.data?.data ?? {};
}

function stampGenerated(invoice, environment, result, via) {
  const record = { ewbNo: result.ewbNo, ewbDate: result.ewbDate, ewbValidity: result.ewbValidity, via };
  if (environment === 'live') {
    invoice.ewbNo = result.ewbNo;
    invoice.ewbDate = result.ewbDate;
    invoice.ewbValidity = result.ewbValidity;
    invoice.ewbVia = via;
  } else {
    invoice.sandboxEwb = record;
  }
}

// ---- live adapters ----

export const EWB_ADAPTERS = {
  ewb_generate: async ({ client, params, state }) => {
    const built = build('ewb_generate', params, state);
    if (!built.ok) return built;
    const invoice = built.invoice;
    // Which IRN applies depends on the key's environment; an IRN of either kind means
    // the e-invoice route, and the answer says which environment it ran in.
    const irn = String(invoice.irn || invoice.sandboxIrn || '');
    let res;
    let via;
    if (irn) {
      via = 'irn';
      res = await client.generateEwayBillByIrn(irn, transportPayload(invoice.transport));
    } else {
      via = 'invoice';
      const partA = built.payload.partA || ewayBillPartA(state, invoice).partA;
      if (!partA) return fail('EWB_DETAILS_MISSING');
      res = await client.generateEwayBill(partA);
    }
    if (!res.ok) return refused(res, 'EWB_FAILED');
    const result = ewbResult(res.data?.data);
    if (!result.ewbNo) return fail('EWB_NO_MISSING', { hint: 'The provider answered without an e-way bill number.' });
    stampGenerated(invoice, res.environment, result, via);
    return { ok: true, data: { invoiceId: invoice.id, via, environment: res.environment || 'test', ...result } };
  },

  ewb_get: async ({ client, params, state }) => {
    const built = build('ewb_get', params, state);
    if (!built.ok) return built;
    let res;
    if (built.payload.docNo) res = await client.ewayBillByDocument(built.payload);
    else if (built.payload.byIrn) res = await client.getEwayBillByIrn(built.invoice.irn || built.invoice.sandboxIrn);
    else res = await client.getEwayBill(built.payload.ewbNo);
    if (!res.ok) return refused(res, 'EWB_LOOKUP_FAILED');
    const data = inner(res);
    return { ok: true, data: { ...ewbResult(res.data?.data), status: String(data?.status || data?.Status || ''), bill: data } };
  },

  ewb_cancel: async ({ client, params, state }) => {
    const built = build('ewb_cancel', params, state);
    if (!built.ok) return built;
    const res = await client.cancelEwayBill(built.payload);
    if (!res.ok) return refused(res, 'EWB_CANCEL_FAILED');
    const data = inner(res);
    const cancelledOn = String(data.cancelDate || new Date().toISOString());
    const invoice = built.invoice;
    if (invoice && res.environment === 'live' && invoice.ewbNo === built.payload.ewbNo) {
      invoice.ewbHistory = [...(invoice.ewbHistory || []), { ewbNo: invoice.ewbNo, ewbDate: invoice.ewbDate || '', cancelledOn, reasonCode: built.payload.reasonCode }];
      delete invoice.ewbNo;
      delete invoice.ewbDate;
      delete invoice.ewbValidity;
      delete invoice.ewbVia;
    } else if (invoice?.sandboxEwb?.ewbNo === built.payload.ewbNo) {
      invoice.sandboxEwb = { ...invoice.sandboxEwb, cancelledOn };
    }
    return { ok: true, data: { cancelled: true, ewbNo: built.payload.ewbNo, cancelledOn } };
  },

  ewb_update_vehicle: async ({ client, params, state }) => {
    const built = build('ewb_update_vehicle', params, state);
    if (!built.ok) return built;
    const res = await client.updateEwayBillVehicle(built.payload.ewbNo, built.payload.body);
    if (!res.ok) return refused(res, 'EWB_VEHICLE_FAILED');
    const data = inner(res);
    const invoice = built.invoice;
    if (invoice && res.environment === 'live') {
      if (invoice.transport && built.payload.body.vehicleNo) invoice.transport = { ...invoice.transport, vehicleNo: built.payload.body.vehicleNo };
      if (data.validUpto) invoice.ewbValidity = String(data.validUpto).trim();
    }
    return { ok: true, data: { ewbNo: built.payload.ewbNo, vehicleNo: built.payload.body.vehicleNo, updatedOn: String(data.vehUpdDate || ''), validUpto: String(data.validUpto || '').trim() } };
  },

  ewb_update_transporter: async ({ client, params, state }) => {
    const built = build('ewb_update_transporter', params, state);
    if (!built.ok) return built;
    const res = await client.updateEwayBillTransporter(built.payload.ewbNo, built.payload.transporterId);
    if (!res.ok) return refused(res, 'EWB_TRANSPORTER_FAILED');
    const data = inner(res);
    if (built.invoice?.transport && res.environment === 'live') built.invoice.transport = { ...built.invoice.transport, transporterId: built.payload.transporterId };
    return { ok: true, data: { ewbNo: built.payload.ewbNo, transporterId: built.payload.transporterId, updatedOn: String(data.transUpdateDate || '') } };
  },

  ewb_extend: async ({ client, params, state }) => {
    const built = build('ewb_extend', params, state);
    if (!built.ok) return built;
    const res = await client.extendEwayBill(built.payload.ewbNo, built.payload.body);
    if (!res.ok) return refused(res, 'EWB_EXTEND_FAILED');
    const data = inner(res);
    const validUpto = String(data.validUpto || '').trim();
    if (built.invoice && res.environment === 'live' && validUpto) built.invoice.ewbValidity = validUpto;
    return { ok: true, data: { ewbNo: built.payload.ewbNo, validUpto, updatedOn: String(data.updatedDate || '') } };
  },

  ewb_consolidate: async ({ client, params, state }) => {
    const built = build('ewb_consolidate', params, state);
    if (!built.ok) return built;
    const res = await client.consolidateEwayBills(built.payload);
    if (!res.ok) return refused(res, 'EWB_CONSOLIDATE_FAILED');
    const data = inner(res);
    const consolidatedEwbNo = String(data.cEwbNo || '');
    if (res.environment === 'live' && consolidatedEwbNo) {
      for (const { ewbNo } of built.payload.tripSheetEwbBills) {
        const invoice = findEwbInvoice(state, { ewbNo: String(ewbNo) });
        if (invoice) invoice.consolidatedEwbNo = consolidatedEwbNo;
      }
    }
    return { ok: true, data: { consolidatedEwbNo, consolidatedOn: String(data.cEwbDate || ''), ewbNos: built.payload.tripSheetEwbBills.map((item) => String(item.ewbNo)) } };
  },

  ewb_multi_vehicle_start: async ({ client, params, state }) => {
    const built = build('ewb_multi_vehicle_start', params, state);
    if (!built.ok) return built;
    const res = await client.startMultiVehicle(built.payload.ewbNo, built.payload.body);
    if (!res.ok) return refused(res, 'EWB_MULTI_VEHICLE_FAILED');
    const data = inner(res);
    return { ok: true, data: { ewbNo: built.payload.ewbNo, groupNo: String(data.groupNo ?? ''), startedOn: String(data.createdDate || '') } };
  },

  ewb_multi_vehicle_add: async ({ client, params, state }) => {
    const built = build('ewb_multi_vehicle_add', params, state);
    if (!built.ok) return built;
    const res = await client.addMultiVehicle(built.payload.ewbNo, built.payload.body);
    if (!res.ok) return refused(res, 'EWB_MULTI_VEHICLE_FAILED');
    const data = inner(res);
    return { ok: true, data: { ewbNo: built.payload.ewbNo, groupNo: String(data.groupNo ?? built.payload.body.groupNo), addedOn: String(data.vehAddedDate || '') } };
  },

  ewb_multi_vehicle_change: async ({ client, params, state }) => {
    const built = build('ewb_multi_vehicle_change', params, state);
    if (!built.ok) return built;
    const res = await client.changeMultiVehicle(built.payload.ewbNo, built.payload.body);
    if (!res.ok) return refused(res, 'EWB_MULTI_VEHICLE_FAILED');
    const data = inner(res);
    return { ok: true, data: { ewbNo: built.payload.ewbNo, groupNo: String(built.payload.body.groupNo), vehicleNo: built.payload.body.newVehicleNo, updatedOn: String(data.vehUpdDate || '') } };
  },

  ewb_consignee_list: async ({ client, params, state }) => {
    const built = build('ewb_consignee_list', params, state);
    if (!built.ok) return built;
    const res = await client.consigneeEwayBills(built.payload.date);
    if (!res.ok) return refused(res, 'EWB_LOOKUP_FAILED');
    const rows = inner(res);
    return { ok: true, data: { date: built.payload.date, bills: Array.isArray(rows) ? rows : [] } };
  },

  ewb_reject: async ({ client, params, state }) => {
    const built = build('ewb_reject', params, state);
    if (!built.ok) return built;
    const res = await client.rejectEwayBill(built.payload.ewbNo);
    if (!res.ok) return refused(res, 'EWB_REJECT_FAILED');
    const data = inner(res);
    return { ok: true, data: { rejected: true, ewbNo: built.payload.ewbNo, rejectedOn: String(data.ewbRejectedDate || '') } };
  },
};

// ---- mock adapters (MYCA_MOCK_MODE): checked like the live ones, nothing leaves the PC ----

function mockEwbNo(seed) {
  let n = 0;
  for (const ch of String(seed)) n = (n * 31 + ch.charCodeAt(0)) % 1e9;
  return `99${String(n).padStart(10, '0')}`;
}

function mocked(operationId, shape) {
  return async ({ params, state }) => {
    const built = build(operationId, params, state);
    if (!built.ok) return built;
    return { ok: true, ...MOCK_TAG, data: shape(built, params, state) };
  };
}

export const EWB_MOCK_ADAPTERS = {
  ewb_generate: async ({ params, state }) => {
    const built = build('ewb_generate', params, state);
    if (!built.ok) return built;
    const ewbNo = mockEwbNo(`${built.invoice.id}:${built.invoice.date}`);
    built.invoice.mockEwb = { ewbNo, ewbDate: ewbDate(built.invoice.date), via: built.payload.via };
    return { ok: true, ...MOCK_TAG, data: { invoiceId: built.invoice.id, via: built.payload.via, environment: 'mock', ewbNo, ewbDate: ewbDate(built.invoice.date), ewbValidity: '', alert: '' } };
  },
  ewb_get: mocked('ewb_get', (built) => ({ ewbNo: built.payload.ewbNo || '', ewbDate: '', ewbValidity: '', status: 'ACT', bill: {} })),
  ewb_cancel: mocked('ewb_cancel', (built) => ({ cancelled: true, ewbNo: built.payload.ewbNo, cancelledOn: 'simulated' })),
  ewb_update_vehicle: mocked('ewb_update_vehicle', (built) => ({ ewbNo: built.payload.ewbNo, vehicleNo: built.payload.body.vehicleNo, updatedOn: 'simulated', validUpto: '' })),
  ewb_update_transporter: mocked('ewb_update_transporter', (built) => ({ ewbNo: built.payload.ewbNo, transporterId: built.payload.transporterId, updatedOn: 'simulated' })),
  ewb_extend: mocked('ewb_extend', (built) => ({ ewbNo: built.payload.ewbNo, validUpto: '', updatedOn: 'simulated' })),
  ewb_consolidate: mocked('ewb_consolidate', (built) => ({ consolidatedEwbNo: '9900000001', consolidatedOn: 'simulated', ewbNos: built.payload.tripSheetEwbBills.map((item) => String(item.ewbNo)) })),
  ewb_multi_vehicle_start: mocked('ewb_multi_vehicle_start', (built) => ({ ewbNo: built.payload.ewbNo, groupNo: '1', startedOn: 'simulated' })),
  ewb_multi_vehicle_add: mocked('ewb_multi_vehicle_add', (built) => ({ ewbNo: built.payload.ewbNo, groupNo: built.payload.body.groupNo, addedOn: 'simulated' })),
  ewb_multi_vehicle_change: mocked('ewb_multi_vehicle_change', (built) => ({ ewbNo: built.payload.ewbNo, groupNo: String(built.payload.body.groupNo), vehicleNo: built.payload.body.newVehicleNo, updatedOn: 'simulated' })),
  ewb_consignee_list: mocked('ewb_consignee_list', (built) => ({ date: built.payload.date, bills: [] })),
  ewb_reject: mocked('ewb_reject', (built) => ({ rejected: true, ewbNo: built.payload.ewbNo, rejectedOn: 'simulated' })),
};

// What the gate records as the request payload (no invoice objects, no secrets).
export function ewbAuditPayload(operationId, params, state) {
  const built = build(operationId, params, state);
  if (!built.ok) return built;
  return { ok: true, payload: built.payload };
}
