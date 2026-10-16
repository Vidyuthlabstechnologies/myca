import { performExternalAction } from './action-gate.mjs';
import { loadChannelConfig, publicChannelConfig } from './channel-connectors.mjs';
import { normalizeClientId } from './books.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { localToday } from './dates.mjs';

const ZOHO_STATE = { '01': 'JK', '02': 'HP', '03': 'PB', '04': 'CH', '05': 'UK', '06': 'HR', '07': 'DL', '08': 'RJ', '09': 'UP', '10': 'BR', '11': 'SK', '12': 'AR', '13': 'NL', '14': 'MN', '15': 'MZ', '16': 'TR', '17': 'ML', '18': 'AS', '19': 'WB', '20': 'JH', '21': 'OD', '22': 'CG', '23': 'MP', '24': 'GJ', '25': 'DD', '26': 'DN', '27': 'MH', '28': 'AP', '29': 'KA', '30': 'GA', '31': 'LD', '32': 'KL', '33': 'TN', '34': 'PY', '35': 'AN', '36': 'TS', '37': 'AD', '38': 'LA' };
const MAX_PER_RUN = 200;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function periodOf(date) {
  return String(date || '').slice(0, 7);
}

export function zohoStateOf(code) {
  return ZOHO_STATE[String(code || '').padStart(2, '0')] || '';
}

export function pickTaxId(taxes, gstRate, intraState) {
  const rate = Number(gstRate || 0);
  if (!rate) return '';
  const list = Array.isArray(taxes) ? taxes : [];
  const same = list.filter((tax) => Number(tax.tax_percentage) === rate);
  const group = same.find((tax) => tax.tax_type === 'tax_group');
  const single = same.find((tax) => tax.tax_type !== 'tax_group' && /igst/i.test(`${tax.tax_name} ${tax.tax_specific_type || ''}`));
  const chosen = intraState ? group || same[0] : single || same.find((tax) => tax.tax_type !== 'tax_group') || same[0];
  return chosen ? String(chosen.tax_id) : '';
}

export function zohoInvoicePayload(invoice, company, { customerId, taxes }) {
  const intraState = String(invoice.placeOfSupply || invoice.partyState || '') === String(company.state || '');
  return {
    customer_id: customerId,
    invoice_number: invoice.id,
    date: invoice.date,
    place_of_supply: zohoStateOf(invoice.placeOfSupply || invoice.partyState || company.state),
    gst_treatment: invoice.partyGstin ? 'business_gst' : 'consumer',
    ...(invoice.partyGstin ? { gst_no: invoice.partyGstin } : {}),
    reference_number: invoice.id,
    line_items: (invoice.lines || []).map((line) => ({
      name: String(line.description || 'Item').slice(0, 100),
      description: String(line.description || '').slice(0, 2000),
      rate: Number(line.rate || 0),
      quantity: Number(line.qty || 1),
      hsn_or_sac: String(line.hsn || ''),
      ...(pickTaxId(taxes, line.gstRate, intraState) ? { tax_id: pickTaxId(taxes, line.gstRate, intraState) } : {}),
    })),
  };
}

export function zohoCandidates(state, period) {
  return (state.invoices || []).filter((inv) => periodOf(inv.date) === period && !inv.cancelledOn && !inv.zohoInvoiceId && !inv.export);
}

function mockPush(invoices) {
  return { ok: true, mock: true, simulated: true, data: { pushed: invoices.map((inv) => ({ id: inv.id, zohoInvoiceId: `MOCK-ZB-${inv.id}`, customerId: 'MOCK-CONTACT' })), failed: [] } };
}

export async function pushZohoInvoices(state, args = {}, { actor } = {}) {
  const period = String(args.period || '').trim() || localToday().slice(0, 7);
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const shown = publicChannelConfig('zoho');
  const candidates = zohoCandidates(state, period).slice(0, MAX_PER_RUN);
  if (!candidates.length) return { ok: true, period, pushed: [], failed: [], nothingToPush: true };
  const company = state.company || {};
  const result = await performExternalAction(state, {
    actionId: 'zoho_push_invoices',
    clientId: normalizeClientId(state.activeClientId),
    params: { period, invoices: candidates.map((inv) => inv.id) },
    actor: actor || { userId: 'owner' },
    approvalId: args.caApprovalId || args.approvalId || '',
    metadata: { period, invoices: candidates.length },
    payload: { period, invoices: candidates.map((inv) => inv.id) },
    fixture: () => mockPush(candidates),
    preflight: () => {
      if (!shown || !shown.configured) return fail('CONNECTOR_NOT_CONFIGURED', { channel: 'zoho', fields: shown?.fields || [], hint: 'Save the Zoho Books credentials first (set_channel_connector zoho).' });
      if (shown.enabled === false) return fail('CONNECTOR_DISABLED', { channel: 'zoho' });
      return null;
    },
  }, async (transports) => {
    const config = loadChannelConfig('zoho');
    const zoho = (op, params) => transports.channel.zoho({ config, op, params });
    const taxes = await zoho('taxes', {});
    if (!taxes.ok) return taxes;
    const pushed = [];
    const failed = [];
    const contacts = new Map();
    for (const inv of candidates) {
      let customerId = contacts.get(inv.partyName);
      if (!customerId) {
        const found = await zoho('findContact', { name: inv.partyName });
        if (!found.ok) { failed.push({ id: inv.id, error: found.error }); continue; }
        customerId = found.contactId;
        if (!customerId) {
          const created = await zoho('createContact', { name: inv.partyName, gstin: inv.partyGstin || '', state: zohoStateOf(inv.placeOfSupply || inv.partyState || company.state) });
          if (!created.ok) { failed.push({ id: inv.id, error: created.error }); continue; }
          customerId = created.contactId;
        }
        contacts.set(inv.partyName, customerId);
      }
      const created = await zoho('createInvoice', { invoice: zohoInvoicePayload(inv, company, { customerId, taxes: taxes.taxes }) });
      if (!created.ok) { failed.push({ id: inv.id, error: created.error, detail: created.detail || '' }); continue; }
      pushed.push({ id: inv.id, zohoInvoiceId: created.invoiceId, customerId });
    }
    return { ok: true, data: { pushed, failed } };
  });
  if (!result.ok) return { ...result, period };
  const on = localToday();
  const byId = new Map(candidates.map((inv) => [inv.id, inv]));
  if (!result.mock) {
    for (const row of result.data.pushed) {
      const inv = byId.get(row.id);
      if (inv) { inv.zohoInvoiceId = row.zohoInvoiceId; inv.zohoPushedOn = on; }
    }
  }
  return { ok: true, period, pushed: result.data.pushed, failed: result.data.failed, mock: Boolean(result.mock) };
}

export function zohoPushWords(result) {
  if (result.nothingToPush) return `Every invoice of ${result.period} is already in Zoho Books, or there are none to send.`;
  const sent = result.pushed.length;
  const head = `${result.mock ? 'Simulated: ' : ''}${sent} ${sent === 1 ? 'invoice' : 'invoices'} of ${result.period} sent to Zoho Books${result.failed.length ? `, ${result.failed.length} refused` : ''}.`;
  const list = result.pushed.slice(0, 8).map((row) => `· ${row.id} → ${row.zohoInvoiceId}`).join('\n');
  const bad = result.failed.slice(0, 5).map((row) => `· ${row.id}: ${row.error}${row.detail ? ` (${row.detail})` : ''}`).join('\n');
  return `${head}${list ? `\n${list}` : ''}${bad ? `\n${bad}` : ''}${result.mock ? '\nNothing was sent and nothing is marked as pushed.' : ' Your books are unchanged; each invoice now remembers its Zoho id.'}`;
}
