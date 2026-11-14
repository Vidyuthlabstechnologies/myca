const UQC_CODES = new Set(['BAG', 'BAL', 'BDL', 'BKL', 'BOU', 'BOX', 'BTL', 'BUN', 'CAN', 'CBM', 'CCM', 'CMS', 'CTN', 'DOZ', 'DRM', 'GGK', 'GMS', 'GRS', 'GYD', 'KGS', 'KLR', 'KME', 'LTR', 'MLT', 'MTR', 'MTS', 'NOS', 'OTH', 'PAC', 'PCS', 'PRS', 'QTL', 'ROL', 'SET', 'SQF', 'SQM', 'SQY', 'TBS', 'TGM', 'THD', 'TON', 'TUB', 'UGS', 'UNT', 'YDS']);

const UQC_WORDS = {
  NOS: ['no', 'nos', 'nr', 'number', 'numbers'],
  PCS: ['pc', 'pcs', 'piece', 'pieces'],
  UNT: ['u', 'unit', 'units'],
  KGS: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  GMS: ['g', 'gm', 'gms', 'gram', 'grams', 'gramme', 'grammes'],
  LTR: ['l', 'lt', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters'],
  MLT: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  KLR: ['kl', 'kilolitre', 'kilolitres', 'kiloliter', 'kiloliters'],
  MTR: ['m', 'mtr', 'mtrs', 'metre', 'metres', 'meter', 'meters'],
  CMS: ['cm', 'cms', 'centimetre', 'centimetres', 'centimeter', 'centimeters'],
  KME: ['km', 'kms', 'kilometre', 'kilometres', 'kilometer', 'kilometers'],
  MTS: ['mt', 'metricton', 'metrictons', 'metrictonne', 'metrictonnes'],
  TON: ['ton', 'tons', 'tonne', 'tonnes'],
  QTL: ['qtl', 'quintal', 'quintals'],
  BOX: ['box', 'boxes'],
  SET: ['set', 'sets'],
  PRS: ['pr', 'prs', 'pair', 'pairs'],
  DOZ: ['dz', 'doz', 'dozen', 'dozens'],
  BAG: ['bag', 'bags'],
  BTL: ['btl', 'bottle', 'bottles'],
  CAN: ['can', 'cans'],
  CTN: ['ctn', 'carton', 'cartons'],
  ROL: ['roll', 'rolls'],
  SQM: ['sqm', 'sqmtr', 'squaremetre', 'squaremetres', 'squaremeter', 'squaremeters'],
  SQF: ['sqf', 'sqft', 'squarefoot', 'squarefeet'],
  SQY: ['sqy', 'sqyd', 'squareyard', 'squareyards'],
  CBM: ['cbm', 'cubicmetre', 'cubicmetres', 'cubicmeter', 'cubicmeters'],
  CCM: ['cc', 'ccm', 'cubiccentimetre', 'cubiccentimetres'],
  BDL: ['bdl', 'bundle', 'bundles'],
  PAC: ['pac', 'pack', 'packs', 'packet', 'packets', 'pkt', 'pkts'],
  TBS: ['tab', 'tabs', 'tablet', 'tablets'],
  GRS: ['gross'],
  DRM: ['drum', 'drums'],
  TUB: ['tube', 'tubes'],
  YDS: ['yd', 'yard', 'yards'],
};

const UQC_BY_WORD = new Map(Object.entries(UQC_WORDS).flatMap(([code, words]) => words.map((word) => [word, code])));

const HSN_DIGITS = /^\d+$/;
const HSN_LENGTHS = [4, 6, 8];
const SIX_DIGIT_AATO_RUPEES = 50000000;
const SPLIT_FROM_FP = 202505;
const DESC_MAX = 30;

const DOC_TYPES = [
  { doc_num: 1, doc_typ: 'Invoices for outward supply', key: 'invoices' },
  { doc_num: 4, doc_typ: 'Debit Note', key: 'debitNotes' },
  { doc_num: 5, doc_typ: 'Credit Note', key: 'creditNotes' },
];

const paise = (value) => Math.round((Number(value) || 0) * 100);
const qtyMilli = (value) => Math.round((Number(value) || 0) * 1000);

export function uqcOf(unit) {
  const text = String(unit ?? '').trim();
  if (!text) return 'OTH';
  if (UQC_CODES.has(text.toUpperCase())) return text.toUpperCase();
  return UQC_BY_WORD.get(text.toLowerCase().replace(/[\s.]+/g, '')) || 'OTH';
}

export function isService(hsn) {
  return String(hsn).startsWith('99');
}

export function minHsnDigits(aato) {
  return Number(aato) > SIX_DIGIT_AATO_RUPEES ? 6 : 4;
}

export function hsnSplitApplies(fp) {
  const text = String(fp || '');
  return Number(`${text.slice(2)}${text.slice(0, 2)}`) >= SPLIT_FROM_FP;
}

export function isVoided(doc) {
  return doc?.status === 'cancelled' && !(Array.isArray(doc.creditNoteIds) && doc.creditNoteIds.length);
}

function hsnProblem(hsn, need) {
  if (!hsn) return 'HSN_MISSING';
  if (!HSN_DIGITS.test(hsn) || hsn.length > 8) return 'HSN_INVALID';
  if (hsn.length < need) return 'HSN_TOO_SHORT';
  if (!HSN_LENGTHS.includes(hsn.length)) return 'HSN_INVALID';
  return null;
}

function unitFromOriginal(line, original) {
  if (line.unit != null && line.unit !== '') return line.unit;
  if (line.uqc != null && line.uqc !== '') return line.uqc;
  const match = (original?.lines || []).find((item) => String(item.hsn ?? '').trim() === String(line.hsn ?? '').trim() && (item.unit || item.uqc));
  return match ? match.unit || match.uqc : '';
}

export function hsnSummary(entries, { fp, aato }) {
  const need = minHsnDigits(aato);
  const split = hsnSplitApplies(fp);
  const buckets = { b2b: new Map(), b2c: new Map(), all: new Map() };
  const problems = [];
  for (const { doc, sign, original } of entries) {
    const section = !split ? 'all' : doc.partyGstin ? 'b2b' : 'b2c';
    (doc.lines || []).forEach((line, index) => {
      const hsn = String(line.hsn ?? '').trim();
      const code = hsnProblem(hsn, need);
      if (code) {
        problems.push({ doc: doc.id, line: index + 1, hsn, code, need, taxable: paise(line.taxable) / 100 });
        return;
      }
      const service = isService(hsn);
      const uqc = service ? 'NA' : uqcOf(unitFromOriginal(line, original));
      const rt = Number(line.gstRate || 0);
      const key = `${hsn}|${uqc}|${rt}`;
      const map = buckets[section];
      if (!map.has(key)) map.set(key, { hsn_sc: hsn, desc: String(line.description ?? '').trim().slice(0, DESC_MAX), uqc, rt, qty: 0, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
      const row = map.get(key);
      if (!row.desc) row.desc = String(line.description ?? '').trim().slice(0, DESC_MAX);
      if (!service) row.qty += sign * qtyMilli(line.qty);
      row.txval += sign * paise(line.taxable);
      row.iamt += sign * paise(line.igst);
      row.camt += sign * paise(line.cgst);
      row.samt += sign * paise(line.sgst);
      row.csamt += sign * paise(line.cess);
    });
  }
  const rowsOf = (map) => [...map.values()]
    .filter((row) => row.qty || row.txval || row.iamt || row.camt || row.samt || row.csamt)
    .sort((a, b) => a.hsn_sc.localeCompare(b.hsn_sc) || a.rt - b.rt || a.uqc.localeCompare(b.uqc))
    .map((row, index) => ({ num: index + 1, hsn_sc: row.hsn_sc, desc: row.desc, uqc: row.uqc, qty: Math.round(row.qty / 10) / 100, rt: row.rt, txval: row.txval / 100, iamt: row.iamt / 100, camt: row.camt / 100, samt: row.samt / 100, csamt: row.csamt / 100 }));
  const table = split ? { hsn_b2b: rowsOf(buckets.b2b), hsn_b2c: rowsOf(buckets.b2c) } : { data: rowsOf(buckets.all) };
  return { table, problems, need };
}

function seriesOf(id) {
  const text = String(id ?? '');
  const found = /^(.*?)(\d+)$/.exec(text);
  return found ? { prefix: found[1], number: Number(found[2]) } : { prefix: text, number: null };
}

export function documentsIssued(groups) {
  const gaps = [];
  const doc_det = [];
  for (const { doc_num, doc_typ, key } of DOC_TYPES) {
    const docs = groups[key] || [];
    if (!docs.length) continue;
    const bySeries = new Map();
    for (const doc of docs) {
      const { prefix, number } = seriesOf(doc.id);
      const seriesKey = number == null ? `=${doc.id}` : prefix;
      if (!bySeries.has(seriesKey)) bySeries.set(seriesKey, []);
      bySeries.get(seriesKey).push({ id: String(doc.id), number, cancelled: isVoided(doc) });
    }
    const rows = [...bySeries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([seriesKey, items], index) => {
      const sorted = [...items].sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || a.id.localeCompare(b.id));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const unique = new Set(sorted.map((item) => item.id)).size;
      if (first.number != null && last.number - first.number + 1 > unique) gaps.push({ doc_num, series: seriesKey, from: first.id, to: last.id, missing: last.number - first.number + 1 - unique });
      const cancel = sorted.filter((item) => item.cancelled).length;
      return { num: index + 1, from: first.id, to: last.id, totnum: unique, cancel, net_issue: unique - cancel };
    });
    doc_det.push({ doc_num, doc_typ, docs: rows });
  }
  return { table: doc_det.length ? { doc_det } : null, gaps };
}
