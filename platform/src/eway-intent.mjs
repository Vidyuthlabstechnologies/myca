import { isNegated, isQuestion, normalizeChat } from './intent.mjs';

const INVOICE = /\b(INV-\d{4,})\b/i;
const VEHICLE = /\b(?:vehicle|truck|lorry|tempo|van)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z]{2}\s?[0-9]{1,2}\s?[A-Z]{0,3}\s?[0-9]{4})\b/i;
const BARE_VEHICLE = /\b([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4})\b/;
const DISTANCE = /\b(\d{1,4})\s*(?:km|kms|kilomet(?:er|re)s?)\b/i;
const TRANSPORTER = /\b(?:transporter|carrier|through|by)\s+(?!road\b|rail\b|air\b|ship\b|truck\b|lorry\b|vehicle\b)([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)(?=\s*(?:,|$|\bvehicle\b|\bdistance\b|\d))/i;
const TRANSPORTER_ID = /\b(?:transporter\s*id|transin|trans\s*id)\s*[:#-]?\s*([0-9]{2}[A-Z0-9]{13})\b/i;
const MODE = /\bby\s+(road|rail|train|air|flight|ship|sea)\b/i;
const DOC = /\b(?:lr|rr|awb|bill\s+of\s+lading|doc(?:ument)?)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,14})\b/i;

function reply(text) {
  return { kind: 'reply', reply: text, tools: [] };
}

export function planTransportFromChat(text) {
  const raw = normalizeChat(text);
  if (!/\b(?:transport|vehicle|truck|lorry|e-?way|goes\s+by|by\s+(?:road|rail|train|air|flight|ship|sea))\b/i.test(raw) || isQuestion(raw) || isNegated(raw)) return null;
  const invoice = raw.match(INVOICE);
  if (!invoice) {
    if (/\btransport\b.*\bfor\b|\bvehicle\b/i.test(raw)) return reply('Say which invoice, for example "transport for INV-0001: vehicle MH12AB1234, 120 km, transporter ABC Logistics". I have recorded nothing.');
    return null;
  }
  const modeWord = (raw.match(MODE) || [])[1]?.toLowerCase() || '';
  const mode = { train: 'rail', flight: 'air', sea: 'ship' }[modeWord] || modeWord || 'road';
  const vehicle = (raw.match(VEHICLE) || [])[1] || (raw.match(BARE_VEHICLE) || [])[1] || '';
  const distance = (raw.match(DISTANCE) || [])[1];
  if (!distance) return reply(`Say the distance in km as well, for example "transport for ${invoice[1].toUpperCase()}: vehicle MH12AB1234, 120 km". I have recorded nothing.`);
  const transporterId = (raw.match(TRANSPORTER_ID) || [])[1] || '';
  const cleaned = raw.replace(TRANSPORTER_ID, ' ').replace(VEHICLE, ' ').replace(DISTANCE, ' ').replace(MODE, ' ');
  const transporterName = ((cleaned.match(TRANSPORTER) || [])[1] || '').trim();
  const docNo = (raw.match(DOC) || [])[1] || '';
  return {
    kind: 'tool',
    name: 'set_transport',
    args: {
      invoiceId: invoice[1].toUpperCase(),
      distanceKm: Number(distance),
      mode,
      ...(vehicle ? { vehicleNo: vehicle.replace(/\s+/g, '').toUpperCase() } : {}),
      ...(transporterName ? { transporterName } : {}),
      ...(transporterId ? { transporterId: transporterId.toUpperCase() } : {}),
      ...(docNo ? { docNo: docNo.toUpperCase() } : {}),
    },
  };
}

export function planAddressFromChat(state, text) {
  const raw = normalizeChat(text);
  if (isQuestion(raw) || isNegated(raw)) return null;
  const said = raw.match(/^(?:the\s+)?address\s+(?:of|for)\s+(.+?)\s+(?:is|:)\s+(.+)$/i) || raw.match(/^(.+?)(?:'s)?\s+address\s+(?:is|:)\s+(.+)$/i);
  if (!said) return null;
  const name = said[1].trim();
  const address = said[2].trim().replace(/[.]+$/, '');
  if (!name || !address) return null;
  const party = (state.parties || []).find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!party) return reply(`I do not have a customer called ${name}. Say the name as it is on their invoices. I have recorded nothing.`);
  return { kind: 'tool', name: 'set_party_address', args: { partyName: party.name, ...(party.gstin ? { partyGstin: party.gstin } : {}), address } };
}
