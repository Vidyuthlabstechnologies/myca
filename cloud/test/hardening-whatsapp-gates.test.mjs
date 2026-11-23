import { createHmac } from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { CONSENT_REPLY } from '../src/whatsapp.mjs';

const CONFIG = { verifyToken: 'verify-me', appSecret: 'app-secret', phoneNumberId: '1234', accessToken: 'tok' };
let api;
const replies = [];
const sender = { async sendText(phone, text) { replies.push({ phone, text }); } };

before(async () => {
  api = await startApi({ whatsapp: CONFIG, whatsappSender: sender });
});
after(async () => { await api.close(); });

let nextId = 1;
function message(from, text) {
  const body = { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ value: { messaging_product: 'whatsapp', messages: [{ from, id: `wamid.gate.${nextId++}`, timestamp: '1', type: 'text', text: { body: text } }] }, field: 'messages' }] }] };
  const raw = JSON.stringify(body);
  return api.call('POST', '/v1/whatsapp/webhook', { raw, headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', CONFIG.appSecret).update(raw).digest('hex')}` } });
}

test('WhatsApp does not read or change the books of someone who has not accepted the current privacy notice', async () => {
  const owner = await api.ownerWithBusiness('+919730000001', { name: 'Consent Gate Traders', state: '29' });
  await api.db.query('delete from consents where user_id = $1', [owner.user.id]);
  const before = (await api.db.query('select version from books where business_id = $1', [owner.businessId])).rows[0].version;

  const asked = await message('919730000001', 'invoice Kiran Stores 5000 GST 18%');
  assert.equal(asked.status, 200, asked.text);
  assert.equal(asked.body.results[0].consentRequired, true, asked.text);
  assert.equal(replies.at(-1).text, CONSENT_REPLY);
  const after = (await api.db.query('select version from books where business_id = $1', [owner.businessId])).rows[0].version;
  assert.equal(after, before, 'the books were not opened for writing');
});

test('a "yes" on WhatsApp goes through the same checks as the app: a pending preview from the app is not posted by another member over WhatsApp', async () => {
  const owner = await api.ownerWithBusiness('+919730000002', { name: 'Chat Gate Traders', state: '29' });
  const staffPhone = '+919730000003';
  await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone: staffPhone, role: 'staff' } });
  const staff = await api.signIn(staffPhone);
  const invitation = (await api.call('GET', '/v1/me', { token: staff.accessToken })).body.invitations[0];
  await api.call('POST', `/v1/invitations/${invitation.id}/accept`, { token: staff.accessToken });

  const held = await message('919730000002', 'invoice Kiran Stores 5000 GST 18%');
  assert.equal(held.body.results[0].awaitingConfirmation, true, held.text);
  const other = await message('919730000003', 'yes');
  assert.notEqual(other.body.results[0].posted, true, other.text);
  const mine = await message('919730000002', 'yes');
  assert.equal(mine.body.results[0].posted, true, mine.text);
});
