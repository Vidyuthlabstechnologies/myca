import { planPosImport } from '../import-pos.mjs';
import { planSettlement, settlementWords } from '../settlements.mjs';
import { planOrderImport, settlementInvoices } from '../marketplace-orders.mjs';
import { planChannelIdentity } from '../marketplace-credits.mjs';
import { parseSkuCostsCsv, planSkuCost } from '../sku-margins.mjs';
import { planInventoryValuation } from '../inventory.mjs';
import { planStockTransfer } from '../stock-transfers.mjs';
import { tally } from '../sprint-load.mjs';
import { parseZohoBooksCsv } from '../import-zoho.mjs';
import { tallyXmlToDayBookCsv } from '../tally-xml.mjs';
import { money } from './shared.mjs';

export function tallyPreview(state, args, csv, label) {
  const parsed = tally.ingest({ type: 'csv', content: csv }, { fileLabel: label });
  const rows = (parsed.rows || []).filter((r) => !r._blocking);
  const already = new Set([...(state.invoices || []), ...(state.purchases || [])].map((d) => d.id));
  const seen = rows.filter((r) => already.has(`TALLY-${r.voucherNo}`) || [...already].some((id) => id.endsWith(`-${r.voucherNo}`))).length;
  return {
    blockers: [],
    summary: `${label}: ${(parsed.rows || []).length} rows parsed, ${rows.length} postable${seen ? `, about ${seen} already in these books and will be skipped` : ''}. Vouchers with no readable GST rate are held back rather than taxed at a guess.`,
    effects: ['Sales and purchase vouchers post as invoices and bills; receipts and payments post to the ledger.', 'Rows already imported are skipped, so importing the same file twice changes nothing.'],
    figures: { rows: (parsed.rows || []).length, postable: rows.length },
  };
}

export function zohoPreview(state, args) {
  const parsed = parseZohoBooksCsv(args.csv);
  const existing = new Set((state.invoices || []).map((i) => i.id));
  const dup = parsed.invoices.filter((i) => existing.has(i.id)).length;
  const noRate = parsed.invoices.filter((i) => i.lines.some((l) => l.gstRate == null)).length;
  return {
    blockers: parsed.meta?.error ? [`The file could not be read: ${parsed.meta.error}.`] : [],
    summary: `Zoho Books: ${parsed.invoices.length} invoices parsed${dup ? `, ${dup} already booked` : ''}${noRate ? `, ${noRate} with no tax rate and so held back` : ''}.`,
    effects: ['Each new invoice posts to the ledger and GSTR-1.'],
    figures: { invoices: parsed.invoices.length, duplicates: dup, missingRate: noRate },
  };
}

export function inventoryValuationPreview(state, args) {
  const planned = planInventoryValuation(state, args);
  if (!planned.ok) {
    const reason = { INVALID_DATE: 'That is not a date I can read.', FUTURE_DATE: 'That date has not come yet.', PERIOD_LOCKED: `That date is in a locked period (through ${planned.lockThrough}).`, NOT_AFTER_LAST: `The last valuation is dated ${planned.lastAsOf}; the next must be after it.`, NO_STOCK: 'Record stock and SKU costs first; nothing is on hand to value.' }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  return {
    blockers: [],
    summary: `Inventory at ${plan.asOf}: ${money(plan.value)} across ${plan.lines.length === 1 ? '1 SKU' : `${plan.lines.length} SKUs`} at recorded cost${plan.previousAsOf ? `, ${money(plan.before)} posted on ${plan.previousAsOf}` : ''}; change ${money(plan.delta)}.`,
    effects: [
      plan.delta > 0 ? `${money(plan.delta)} goes into Inventory against Change in inventory, so cost of goods this period falls by that much.` : plan.delta < 0 ? `${money(-plan.delta)} comes out of Inventory, so cost of goods this period rises by that much.` : 'Nothing posts; the value is unchanged.',
      ...(plan.uncosted.length ? [`Left out, no cost set: ${plan.uncosted.map((row) => `${row.sku} (${row.qty})`).join(', ')}. Set their costs and value again for the full figure.`] : []),
    ],
    figures: { value: plan.value, delta: plan.delta },
  };
}

export function skuCostPreview(state, args) {
  const planned = planSkuCost(state, args);
  if (!planned.ok) return { blockers: [{ SKU_REQUIRED: 'Say which SKU.', BAD_AMOUNT: 'The cost is zero or more per unit.', BAD_RATE: 'A GST rate is 0 to 28.', NOTHING_TO_CHANGE: 'Give a cost, a name, an HSN or a GST rate.', INVALID_DATE: 'That is not a date I can read.' }[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  return {
    blockers: [],
    summary: `${plan.sku}${plan.next.name ? ` (${plan.next.name})` : ''}: cost ${plan.next.cost == null ? 'not set' : money(plan.next.cost)} per unit${plan.next.gstRate != null ? `, GST ${plan.next.gstRate}%` : ''}${plan.before?.cost != null && plan.before.cost !== plan.next.cost ? ` (was ${money(plan.before.cost)})` : ''}.`,
    effects: ['Margins and stock values use it from now; nothing posts to the ledger.'],
    figures: { cost: plan.next.cost },
  };
}

export function skuCostsImportPreview(state, args) {
  const parsed = parseSkuCostsCsv(args.csv || '');
  if (!parsed.ok) return { blockers: [parsed.error === 'NO_HEADER' ? `The sheet needs ${parsed.need}.` : 'The sheet has no SKU rows I can read.'], summary: '', effects: [], figures: {} };
  return {
    blockers: [],
    summary: `SKU costs: ${parsed.lines.length === 1 ? '1 SKU' : `${parsed.lines.length} SKUs`} read${parsed.held.length ? `; ${parsed.held.length} rows held back` : ''}.`,
    effects: ['Later rows for the same SKU replace earlier ones; margins and stock values use them from now.'],
    figures: { skus: parsed.lines.length },
  };
}

export function channelIdentityPreview(state, args) {
  const planned = planChannelIdentity(state, args);
  if (!planned.ok) return { blockers: [{ BAD_CHANNEL: 'Say which marketplace.', BAD_GSTIN: 'That is not a valid GSTIN.', BAD_TAN: 'A TAN is four letters, five digits and a letter.', NOTHING_TO_CHANGE: 'Give the GSTIN, the TAN or a name.' }[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  return { blockers: [], summary: `${plan.channel}: ${[plan.next.gstin ? `GSTIN ${plan.next.gstin}` : '', plan.next.tan ? `TAN ${plan.next.tan}` : '', plan.next.name || ''].filter(Boolean).join(', ')}.`, effects: ['The TCS statement and Form 26AS match this channel by number from now.'], figures: {} };
}

export function stockTransferPreview(state, args) {
  const planned = planStockTransfer(state, args);
  if (!planned.ok) {
    const reason = { SKU_REQUIRED: 'Say which SKU.', BAD_QTY: 'A quantity is a number above zero.', UNKNOWN_REGISTRATION: `${planned.gstin} is not a registration of this business.`, SAME_REGISTRATION: 'Both ends are the same registration; record the stock at its new location instead.', REGISTRATION_RETIRED: 'That registration is retired.', INVALID_DATE: 'That is not a date I can read.', COST_REQUIRED: 'Set the SKU cost first, or give a unit value; transfers go at cost by default.', RATE_REQUIRED: 'Say the GST rate of the goods, or set it on the SKU.', BAD_AMOUNT: 'The unit value must be zero or more.' }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const tax = Math.round(plan.taxable * plan.gstRate) / 100;
  return {
    blockers: [],
    summary: `Transfer ${plan.qty} of ${plan.sku} from ${plan.from.label} (${plan.from.gstin}) to ${plan.to.label} (${plan.to.gstin}) on ${plan.date} ${plan.atCost ? 'at cost' : 'at the stated value'}: ${money(plan.taxable)} plus IGST ${money(tax)}.`,
    effects: ['A transfer invoice posts under the sending registration and a bill with input credit under the receiving one; the two are settled by contra, so nothing is owed.', 'The stock moves between the two locations.', 'If the goods are above the e-way bill limit, the invoice will say an e-way bill is needed.'],
    figures: { taxable: plan.taxable, tax, qty: plan.qty },
  };
}

export function stockPreview(state, args) {
  const sku = String(args.sku || '').trim().toUpperCase();
  const qty = Number(args.qty);
  const blockers = [];
  if (!sku) blockers.push('Say which SKU.');
  if (!Number.isFinite(qty) || qty === 0) blockers.push('A quantity is a number other than zero.');
  const location = String(args.location || 'own').trim().toLowerCase();
  return {
    blockers,
    summary: blockers.length ? '' : `${qty > 0 ? `Stock in: ${qty}` : `Stock out: ${-qty}`} of ${sku} at ${location}${args.date ? ` on ${args.date}` : ''}.`,
    effects: ['Only the stock count changes; nothing posts to the ledger.'],
    figures: { qty, sku, location },
  };
}

export function ordersPreview(state, args) {
  const planned = planOrderImport(state, args);
  if (!planned.ok) {
    const reason = planned.error === 'NO_HEADER' ? `The file needs ${planned.parsed.need}.` : planned.error === 'EMPTY' || planned.error === 'NO_ROWS' ? 'The file has no order rows I can read.' : `The file could not be read: ${planned.error}.`;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const reasons = {};
  for (const row of planned.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already in the books', return_exists: 'returns already recorded', ORDER_NOT_FOUND: 'returns for orders not in the books', STATE_UNKNOWN: 'rows with a delivery state I cannot place', RATE_REQUIRED: 'rows with no GST rate', INVALID_DATE: 'rows with a date I cannot read', BAD_AMOUNT: 'rows with an amount I cannot read', PERIOD_LOCKED: 'in a locked period', ORDER_ID_REQUIRED: 'rows with no order id', TOO_MANY_ROWS: 'rows beyond the 5,000 an import takes' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  const taxable = planned.ready.reduce((sum, day) => sum + day.taxable, 0);
  const states = new Set(planned.ready.map((day) => day.state));
  const name = planned.channel === 'marketplace' ? 'Marketplace' : planned.channel[0].toUpperCase() + planned.channel.slice(1);
  const effects = [`Each day and delivery state posts as one invoice to "${name} customers" with a line per GST rate, so GSTR-1 shows them under B2CS by state.`];
  if (planned.returns.length) effects.push(`${planned.returns.length === 1 ? '1 return posts' : `${planned.returns.length} returns post`} as credit notes against the orders they reverse.`);
  effects.push('Nothing is received yet; the next settlement from this channel settles these invoices and books the fees, TCS and TDS.');
  return {
    blockers: planned.ready.length || planned.returns.length ? [] : [`Every row was held back${held.length ? `: ${held.join('; ')}` : ''}; nothing to post.`],
    summary: `${name} orders: ${planned.parsed.orders === 1 ? '1 order' : `${planned.parsed.orders} orders`} over ${planned.ready.length === 1 ? '1 day-and-state invoice' : `${planned.ready.length} day-and-state invoices`} across ${states.size === 1 ? '1 state' : `${states.size} states`}, taxable ${money(taxable)}${planned.returns.length ? `, ${planned.returns.length === 1 ? '1 return' : `${planned.returns.length} returns`}` : ''}${held.length ? `; held back: ${held.join('; ')}` : ''}.`,
    effects,
    figures: { orders: planned.parsed.orders, invoices: planned.ready.length, returns: planned.returns.length, taxable: Math.round(taxable * 100) / 100, heldBack: planned.skipped.length },
  };
}

export function settlementPreview(state, args) {
  const planned = planSettlement(state, args);
  if (!planned.ok) {
    const reason = planned.error === 'NO_HEADER' ? `The file needs ${planned.parsed.need}.` : planned.error === 'SETTLEMENT_EXISTS' ? `This settlement is already in the books as ${planned.id}.` : planned.error === 'EMPTY' || planned.error === 'NO_ROWS' ? 'The file has no settlement rows I can read.' : `The file could not be read: ${planned.error}.`;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const settles = settlementInvoices(state, plan);
  const effects = [settles.length
    ? `It settles ${settles.length === 1 ? '1 marketplace invoice' : `${settles.length} marketplace invoices`} in the books: the payout goes to the bank, fees and penalties to Marketplace fees, TCS and TDS 194-O to receivables to claim; any shortfall stays outstanding on the channel.`
    : 'None of these orders is in the books yet, so nothing posts to the ledger: the settlement is recorded with its figures. Import the order report first to have it settle the sales.'];
  if (plan.status === 'short') effects.push(`The shortfall of ${money(plan.shortfall)} becomes an exception to take up with the marketplace.`);
  if (plan.status === 'unmatched') effects.push('No bank credit of this amount is in the books yet; it stays an exception until the statement with it is imported, or say "import settlement, bank received <amount>".');
  if (plan.penalties.length) effects.push(`${plan.penalties.length === 1 ? '1 penalty' : `${plan.penalties.length} penalties`} totalling ${money(-plan.totals.penalty)} become exceptions with their order ids.`);
  if (plan.totals.tcs || plan.totals.tds) effects.push(`TCS ${money(-plan.totals.tcs)} and TDS 194-O ${money(-plan.totals.tds)} are recorded as credits to claim.`);
  if (plan.held.length) effects.push(`${plan.held.length} rows with an amount I cannot read were skipped.`);
  return {
    blockers: [],
    summary: settlementWords(plan, money),
    effects,
    figures: { expected: plan.expected, paid: plan.paid, shortfall: plan.shortfall, orders: plan.orders, status: plan.status },
  };
}

export function posImportPreview(state, args) {
  const plan = planPosImport(state, args);
  if (!plan.ok) return { blockers: [plan.error === 'NO_HEADER' ? `The file needs ${plan.parsed.need}.` : `The file could not be read: ${plan.error}.`], summary: '', effects: [], figures: {} };
  const reasons = {};
  for (const row of plan.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already imported', tax_differs: 'whose GST in the file differs from the rate', RATE_REQUIRED: 'rows with no GST rate', INVALID_DATE: 'rows with a date I cannot read', BAD_AMOUNT: 'rows with an amount I cannot read', PERIOD_LOCKED: 'in a locked period' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  const total = plan.ready.reduce((sum, item) => sum + item.taxable + item.tax, 0);
  return {
    blockers: [],
    summary: `Counter sales: ${plan.parsed.count === 1 ? '1 day' : `${plan.parsed.count} days`} read, ${plan.ready.length} ready to post${plan.ready.length ? ` totalling ${money(total)}` : ''}${held.length ? `; held back: ${held.join('; ')}` : ''}.`,
    effects: ['Each day posts as one walk-in invoice with a line per GST rate, so GSTR-1 shows it under B2CS by rate.', 'Nothing is matched to a customer; these are counter sales to unregistered buyers.'],
    figures: { days: plan.parsed.count, ready: plan.ready.length, heldBack: plan.skipped.length },
  };
}

export function xmlPreview(state, args) {
  const converted = tallyXmlToDayBookCsv(args.xml);
  if (!converted.ok) return { blockers: [converted.error], summary: 'The XML could not be read.', effects: [], figures: {} };
  return tallyPreview(state, args, converted.csv, `Tally XML (${converted.count} vouchers)`);
}
