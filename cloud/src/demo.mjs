export const DEMO_GSTIN = '29AAACD0000D1ZL';
export const DEMO_NAME = 'Demo: Kaveri Traders';
export const DEMO_INACTIVE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(at) {
  return new Date(at).toISOString().slice(0, 10);
}

function monthDay(today, monthsBack, day) {
  const base = new Date(`${today}T00:00:00Z`);
  const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - monthsBack, day));
  return isoDay(Math.min(target.getTime(), base.getTime() - DAY_MS));
}

export function demoPlan(today) {
  const steps = [];
  for (const back of [3, 2, 1]) {
    steps.push(['create_invoice', { date: monthDay(today, back, 4), partyName: 'Sri Lakshmi Stores', partyState: '29', lines: [{ description: 'Steel almirah', qty: 2, rate: 14500, gstRate: 18 }, { description: 'Plastic chairs', qty: 10, rate: 650, gstRate: 18 }] }]);
    steps.push(['create_invoice', { date: monthDay(today, back, 11), partyName: 'Pune Office Supplies', partyGstin: '27AAACD0001D1ZO', lines: [{ description: 'Office desks', qty: 4, rate: 9800, gstRate: 18 }] }]);
    steps.push(['create_purchase', { date: monthDay(today, back, 6), partyName: 'Mysuru Metal Works', partyState: '29', supplierInvoiceNo: `MMW-${4 - back}1`, lines: [{ description: 'Steel sheets', qty: 20, rate: 1800, gstRate: 18 }] }]);
    steps.push(['post_expense', { date: monthDay(today, back, 5), amount: 25000, narration: 'Shop rent', payee: 'Ravi Properties', mode: 'bank' }]);
    steps.push(['post_expense', { date: monthDay(today, back, 15), amount: 3200, gstRate: 18, narration: 'Electricity and internet', payee: 'BESCOM', mode: 'bank' }]);
  }
  return steps;
}

export async function seedDemo(session, today, actor) {
  const done = [];
  for (const [name, args] of demoPlan(today)) {
    const out = await session.tool(name, args, actor);
    if (out.ok === false) return { ok: false, error: 'DEMO_SEED_FAILED', step: name, cause: out.error || '' };
    done.push({ name, id: out.invoice?.id || out.purchase?.id || out.expense?.id || out.id || '' });
  }
  const invoices = session.state.invoices.filter((invoice) => invoice.id && !invoice.cancelled).slice(0, 2);
  for (const invoice of invoices) {
    const out = await session.tool('record_receipt', { invoiceId: invoice.id, mode: 'bank', date: invoice.date }, actor);
    if (out.ok === false) return { ok: false, error: 'DEMO_SEED_FAILED', step: 'record_receipt', cause: out.error || '' };
    done.push({ name: 'record_receipt', id: invoice.id });
  }
  return { ok: true, steps: done.length };
}

export const DEMO_BLOCKED_ACTIONS = new Set(['gst-portal', 'quicko', 'quicko-session', 'gst-gstr1', 'gst-gstr3b', 'tds-fvu', 'einvoice', 'connectors', 'connector-sync', 'plaid-link-token', 'plaid-exchange', 'gusto-connect', 'taxjar-rate', 'invitations', 'inbound', 'subscription', 'replace']);
