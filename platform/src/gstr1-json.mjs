/**
 * GSTN offline-tool GSTR-1 JSON (public schema).
 * Built from posted invoices — same source as GSTR-1 tables. Not uploaded to GSTN.
 *
 * Rate validity and the B2CL threshold are read from the dated statutory rules on
 * each invoice's date. Invoices that cannot be reported as they stand are held
 * back with a reason instead of being guessed into a table.
 */
import { createHash } from 'node:crypto';
import { invoiceAsFiled, amendmentsInPeriod } from './invoice-amendments.mjs';
import { rules, gstin as gstinLib } from './sprint-load.mjs';

const FP_RE = /^(0[1-9]|1[0-2])\d{4}$/;

function fpFromDate(iso) {
  const [y, m] = String(iso || '').split('-');
  return y && m ? `${m}${y}` : '';
}

function ddmmyyyy(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : '';
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function rateInForce(rate, onDate) {
  const found = rules.rule('gst.rates.valid', onDate);
  return found.ok && found.value.includes(Number(rate));
}

// GSTN wants one item per rate on an invoice, not one per line.
function itemsByRate(lines) {
  const byRate = new Map();
  for (const l of lines || []) {
    const rt = Number(l.gstRate || 0);
    if (!byRate.has(rt)) byRate.set(rt, { rt, txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0 });
    const row = byRate.get(rt);
    row.txval = round2(row.txval + round2(l.taxable));
    row.camt = round2(row.camt + round2(l.cgst));
    row.samt = round2(row.samt + round2(l.sgst));
    row.iamt = round2(row.iamt + round2(l.igst));
  }
  return [...byRate.values()].sort((a, b) => a.rt - b.rt).map((itm_det, idx) => ({ num: idx + 1, itm_det }));
}

function holdReason(inv) {
  const bad = (inv.lines || []).find((l) => !rateInForce(l.gstRate || 0, inv.date));
  if (bad) return { code: 'RATE_NOT_IN_FORCE', rate: Number(bad.gstRate || 0) };
  if (inv.partyGstin) {
    const check = gstinLib.validateGstin(inv.partyGstin, { onDate: inv.date });
    if (!check.ok) return { code: 'INVALID_GSTIN', gstin: String(inv.partyGstin), errors: check.errors.map((e) => e.code) };
  }
  return null;
}

function isB2cl(inv, pos, supplierState) {
  if (pos === supplierState) return false;
  if (inv.source === 'marketplace') return false;
  const found = rules.rule('gst.b2cl.threshold', inv.date);
  return found.ok && Math.round((Number(inv.total) || 0) * 100) > found.value;
}

function turnover(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? null : round2(value);
}

export function invoicesToGstr1Json(company, invoices = [], periodFp, opts = {}) {
  const gstin = company.gstin || '';
  const supplierState = String(company.state || gstin.slice(0, 2) || '').padStart(2, '0');
  if (periodFp != null && periodFp !== '' && !FP_RE.test(String(periodFp))) {
    return { error: 'FP_INVALID', hint: 'Return period must be MMYYYY, for example 082026.' };
  }
  const dated = (invoices || []).filter((i) => i.date);
  const fp = periodFp || fpFromDate(dated.map((i) => i.date).sort().slice(-1)[0] || '');
  const inPeriod = (opts.allGiven ? dated : dated.filter((i) => fpFromDate(i.date) === fp)).map((i) => invoiceAsFiled(i, `${fp.slice(2)}-${fp.slice(0, 2)}`));
  const b2bMap = new Map();
  const b2clMap = new Map();
  const b2csMap = new Map();
  const expMap = new Map();
  const held = [];

  for (const inv of inPeriod) {
    const reason = holdReason(inv);
    if (reason) {
      held.push({ inum: inv.id, idt: ddmmyyyy(inv.date), ...reason });
      continue;
    }
    const pos = String(inv.partyState || inv.placeOfSupply || supplierState).padStart(2, '0');
    const val = round2(inv.total);
    if (inv.export) {
      const expTyp = inv.export.withTax ? 'WPAY' : 'WOPAY';
      if (!expMap.has(expTyp)) expMap.set(expTyp, []);
      expMap.get(expTyp).push({
        inum: inv.id,
        idt: ddmmyyyy(inv.date),
        val,
        ...(inv.export.portCode ? { sbpcode: inv.export.portCode } : {}),
        ...(inv.export.shippingBillNo ? { sbnum: inv.export.shippingBillNo } : {}),
        ...(inv.export.shippingBillDate ? { sbdt: ddmmyyyy(inv.export.shippingBillDate) } : {}),
        itms: (inv.lines || []).map((l, i) => ({ num: i + 1, txval: round2(l.taxable), rt: Number(l.gstRate || 0), iamt: round2(l.igst), csamt: 0 })),
      });
      continue;
    }
    if (inv.partyGstin) {
      const ctin = String(inv.partyGstin).toUpperCase();
      if (!b2bMap.has(ctin)) b2bMap.set(ctin, []);
      b2bMap.get(ctin).push({ inum: inv.id, idt: ddmmyyyy(inv.date), val, pos, rchrg: 'N', inv_typ: 'R', itms: itemsByRate(inv.lines) });
    } else if (isB2cl(inv, pos, supplierState)) {
      if (!b2clMap.has(pos)) b2clMap.set(pos, []);
      b2clMap.get(pos).push({ inum: inv.id, idt: ddmmyyyy(inv.date), val, itms: itemsByRate(inv.lines) });
    } else {
      // B2CS is consolidated by place of supply and rate, per the GSTN schema.
      for (const { itm_det } of itemsByRate(inv.lines)) {
        const key = `${pos}|${itm_det.rt}`;
        if (!b2csMap.has(key)) {
          b2csMap.set(key, { sply_ty: pos === supplierState ? 'INTRA' : 'INTER', rt: itm_det.rt, typ: 'OE', pos, txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0 });
        }
        const row = b2csMap.get(key);
        row.txval = round2(row.txval + itm_det.txval);
        row.camt = round2(row.camt + itm_det.camt);
        row.samt = round2(row.samt + itm_det.samt);
        row.iamt = round2(row.iamt + itm_det.iamt);
      }
    }
  }

  const cdnrMap = new Map();
  const cdnur = [];
  const allInvoices = new Map((invoices || []).map((inv) => [inv.id, inv]));
  const notesInPeriod = [
    ...(opts.creditNotes || []).map((note) => ({ ...note, ntty: 'C', sign: -1 })),
    ...(opts.debitNotes || []).map((note) => ({ ...note, ntty: 'D', sign: 1 })),
  ].filter((note) => note.date && fpFromDate(note.date) === fp);
  for (const note of notesInPeriod) {
    const reason = holdReason(note);
    if (reason) {
      held.push({ inum: note.id, idt: ddmmyyyy(note.date), ...reason, creditNote: true });
      continue;
    }
    const pos = String(note.partyState || note.placeOfSupply || supplierState).padStart(2, '0');
    const val = round2(note.total);
    const original = allInvoices.get(note.invoiceId) || note;
    if (note.partyGstin) {
      const ctin = String(note.partyGstin).toUpperCase();
      if (!cdnrMap.has(ctin)) cdnrMap.set(ctin, []);
      cdnrMap.get(ctin).push({ ntty: note.ntty, nt_num: note.id, nt_dt: ddmmyyyy(note.date), pos, rchrg: 'N', inv_typ: 'R', val, itms: itemsByRate(note.lines) });
    } else if (isB2cl(original, pos, supplierState)) {
      cdnur.push({ ntty: note.ntty, nt_num: note.id, nt_dt: ddmmyyyy(note.date), typ: 'B2CL', pos, val, itms: itemsByRate(note.lines) });
    } else {
      // Credit notes against small unregistered sales are netted in B2CS (table 7).
      for (const { itm_det } of itemsByRate(note.lines)) {
        const key = `${pos}|${itm_det.rt}`;
        if (!b2csMap.has(key)) {
          b2csMap.set(key, { sply_ty: pos === supplierState ? 'INTRA' : 'INTER', rt: itm_det.rt, typ: 'OE', pos, txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0 });
        }
        const row = b2csMap.get(key);
        row.txval = round2(row.txval + note.sign * itm_det.txval);
        row.camt = round2(row.camt + note.sign * itm_det.camt);
        row.samt = round2(row.samt + note.sign * itm_det.samt);
        row.iamt = round2(row.iamt + note.sign * itm_det.iamt);
      }
    }
  }

  const body = { gstin, fp, version: 'GST3.1.6' };
  // gt is the preceding FY's aggregate turnover and cur_gt the current FY's to date.
  // Neither can be derived from one month of invoices, so they are only taken as given.
  const gt = turnover(opts.grossTurnover ?? company.grossTurnoverPrevFy);
  const curGt = turnover(opts.currentGrossTurnover ?? company.grossTurnoverCurrentFy);
  if (gt != null) body.gt = gt;
  if (curGt != null) body.cur_gt = curGt;
  body.b2b = [...b2bMap.entries()].map(([ctin, inv]) => ({ ctin, inv }));
  body.b2cl = [...b2clMap.entries()].map(([pos, inv]) => ({ pos, inv }));
  body.b2cs = [...b2csMap.values()];
  if (expMap.size) body.exp = [...expMap.entries()].map(([exp_typ, inv]) => ({ exp_typ, inv }));

  const b2baMap = new Map();
  const b2claMap = new Map();
  const b2csaMap = new Map();
  for (const { original, revised, amendment } of amendmentsInPeriod(invoices || [], `${fp.slice(2)}-${fp.slice(0, 2)}`)) {
    if (holdReason(revised)) {
      held.push({ inum: revised.id, idt: ddmmyyyy(revised.date), ...holdReason(revised), amendment: amendment.id });
      continue;
    }
    const pos = String(revised.partyState || revised.placeOfSupply || supplierState).padStart(2, '0');
    const entry = { oinum: original.id, oidt: ddmmyyyy(original.date), inum: revised.id, idt: ddmmyyyy(revised.date), val: round2(revised.total), pos, rchrg: 'N', inv_typ: 'R', itms: itemsByRate(revised.lines) };
    if (revised.partyGstin) {
      const ctin = String(revised.partyGstin).toUpperCase();
      if (!b2baMap.has(ctin)) b2baMap.set(ctin, []);
      b2baMap.get(ctin).push(entry);
    } else if (isB2cl(revised, pos, supplierState)) {
      if (!b2claMap.has(pos)) b2claMap.set(pos, []);
      b2claMap.get(pos).push({ oinum: entry.oinum, oidt: entry.oidt, inum: entry.inum, idt: entry.idt, val: entry.val, itms: entry.itms });
    } else {
      const omon = fpFromDate(original.date);
      for (const { itm_det } of itemsByRate(revised.lines)) {
        const key = `${pos}|${itm_det.rt}|${omon}`;
        if (!b2csaMap.has(key)) b2csaMap.set(key, { sply_ty: pos === supplierState ? 'INTRA' : 'INTER', omon, rt: itm_det.rt, typ: 'OE', pos, txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0 });
        const row = b2csaMap.get(key);
        row.txval = round2(row.txval + itm_det.txval);
        row.camt = round2(row.camt + itm_det.camt);
        row.samt = round2(row.samt + itm_det.samt);
        row.iamt = round2(row.iamt + itm_det.iamt);
      }
    }
  }
  if (b2baMap.size) body.b2ba = [...b2baMap.entries()].map(([ctin, inv]) => ({ ctin, inv }));
  if (b2claMap.size) body.b2cla = [...b2claMap.entries()].map(([pos, inv]) => ({ pos, inv }));
  if (b2csaMap.size) body.b2csa = [...b2csaMap.values()];
  if (cdnrMap.size) body.cdnr = [...cdnrMap.entries()].map(([ctin, nt]) => ({ ctin, nt }));
  if (cdnur.length) body.cdnur = cdnur;
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const warnings = [];
  if (gt == null || curGt == null) warnings.push('GT_NOT_PROVIDED: enter last FY and current FY aggregate turnover before upload if the offline tool asks for them.');
  if (held.length) warnings.push(`${held.length} invoice(s) held back for review; see held.`);
  const nilMap = new Map();
  let unsplitZeroLines = 0;
  for (const inv of inPeriod) {
    if (inv.status === 'cancelled') continue;
    const pos = String(inv.placeOfSupply || inv.partyState || supplierState);
    const intra = pos === supplierState;
    const registered = Boolean(inv.partyGstin);
    const sply_ty = `${intra ? 'INTRA' : 'INTR'}${registered ? 'B2B' : 'B2C'}`;
    for (const line of inv.lines || []) {
      if (Number(line.gstRate || 0) !== 0) continue;
      if (!line.supply) {
        unsplitZeroLines += 1;
        continue;
      }
      if (!nilMap.has(sply_ty)) nilMap.set(sply_ty, { sply_ty, nil_amt: 0, expt_amt: 0, ngsup_amt: 0 });
      const row = nilMap.get(sply_ty);
      const field = line.supply === 'nil' ? 'nil_amt' : line.supply === 'exempt' ? 'expt_amt' : 'ngsup_amt';
      row[field] = round2(row[field] + Number(line.taxable || 0));
    }
  }
  if (nilMap.size) body.nil = { inv: [...nilMap.values()] };
  if (unsplitZeroLines) warnings.push(`${unsplitZeroLines === 1 ? '1 line' : `${unsplitZeroLines} lines`} at 0% GST carry no supply type and are left out of table 8 (nil); mark each as nil-rated, exempt or non-GST.`);
  if (body.b2cs.some((row) => row.txval < 0)) warnings.push('B2CS_NEGATIVE: credit notes against small unregistered sales exceed those sales in this month; the net row is negative.');
  return {
    ...body,
    hash,
    held,
    warnings,
    caveat: 'JSON for GSTN offline utility / CA review. MyCA does not upload this file.',
  };
}
