import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';

export const VECTOR_SEED = 20261121;
export const VECTOR_COUNT = 300;
export const VECTOR_DATE = '2026-06-15';
export const VECTORS_PATH = fileURLToPath(new URL('../test/fixtures/offline-invoice-vectors.json', import.meta.url));

const GST_RATES = [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 40];
const SUPPLIER_STATES = ['27', '29', '07', '33', '09', '24', '19', '36'];
const PARTY_STATES = ['27', '29', '07', '33', '09', '24', '19', '36', '01', '10', '32', '38'];
const AWKWARD_RATES = [0.01, 0.05, 0.5, 0.99, 1.005, 2.345, 10.005, 33.33, 99.995, 101.01, 999.99, 1234.565, 9999.99, 99999.99];
const PANS = ['AABCU9603R', 'AAACR5055K', 'AAFCB1234C', 'BBBPK4321L', 'CCCFM8888Q', 'AAGCS0042T'];
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstinFor(stateCode, pan, entity = '1') {
  const body = `${stateCode}${pan}${entity}Z`;
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const product = ALPHABET.indexOf(body[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return `${body}${ALPHABET[(36 - (sum % 36)) % 36]}`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function quantity(random) {
  const kind = random();
  if (kind < 0.45) return 1 + Math.floor(random() * 50);
  if (kind < 0.7) return Math.round((random() * 20 + 0.001) * 1000) / 1000;
  if (kind < 0.85) return Math.round((random() * 5 + 0.1) * 100) / 100;
  return Math.round((random() * 2 + 0.001) * 10) / 10 || 0.5;
}

function rate(random) {
  const kind = random();
  if (kind < 0.3) return pick(random, AWKWARD_RATES);
  if (kind < 0.6) return Math.round(random() * 5000 * 100) / 100;
  if (kind < 0.85) return 1 + Math.floor(random() * 2000);
  return Math.round(random() * 100 * 100) / 100;
}

function freshState(supplierState) {
  const state = createState();
  state.company = { ...state.company, state: supplierState, gstin: gstinFor(supplierState, 'AABCU9603R') };
  return state;
}

function caseFor(random, index) {
  const supplierState = pick(random, SUPPLIER_STATES);
  const b2b = random() < 0.45;
  const intra = random() < 0.5;
  const partyState = intra ? supplierState : pick(random, PARTY_STATES.filter((code) => code !== supplierState));
  const partyGstin = b2b ? gstinFor(partyState, pick(random, PANS.slice(1)), String(1 + Math.floor(random() * 9))) : '';
  const count = 1 + Math.floor(random() * 6);
  const lines = Array.from({ length: count }, () => ({ qty: quantity(random), rate: rate(random), gstRate: pick(random, GST_RATES) }));
  return { id: `v${String(index + 1).padStart(3, '0')}`, supplierState, partyState, partyGstin, lines };
}

function expectedOf(invoice) {
  return {
    lines: invoice.lines.map((line) => ({ taxable: line.taxable, cgst: line.cgst, sgst: line.sgst, igst: line.igst, tax: line.tax, amount: line.amount })),
    taxable: invoice.taxable,
    cgst: invoice.cgst,
    sgst: invoice.sgst,
    igst: invoice.igst,
    total: invoice.total,
  };
}

export function buildVectors() {
  const random = mulberry32(VECTOR_SEED);
  const vectors = [];
  while (vectors.length < VECTOR_COUNT) {
    const spec = caseFor(random, vectors.length);
    const state = freshState(spec.supplierState);
    const created = createInvoice(state, {
      date: VECTOR_DATE,
      partyName: spec.partyGstin ? `Buyer ${spec.id}` : 'Walk-in',
      partyGstin: spec.partyGstin,
      partyState: spec.partyState,
      lines: spec.lines.map((line, at) => ({ description: `Item ${at + 1}`, qty: line.qty, rate: line.rate, gstRate: line.gstRate })),
    });
    if (!created.ok) continue;
    vectors.push({ ...spec, partyState: created.invoice.placeOfSupply, expected: expectedOf(created.invoice) });
  }
  return { version: 1, seed: VECTOR_SEED, date: VECTOR_DATE, generator: 'platform/scripts/offline-invoice-vectors.mjs', vectors };
}

export function vectorsJson() {
  return `${JSON.stringify(buildVectors(), null, 2)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(VECTORS_PATH, vectorsJson());
  process.stdout.write(`Wrote ${VECTOR_COUNT} vectors to ${VECTORS_PATH}\n`);
}
