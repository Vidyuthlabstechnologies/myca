import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmiratesId, maskEmiratesId, isUaeIban, maskUaeIban, redactEmiratesIds, redactUaeForModel } from '../src/ae-identity.mjs';
import { redactModelRequest, redactTinsFor, redactTinsDeepFor } from '../src/us-identity.mjs';

const EID = '784199012345676';
const IBAN = 'AE070331234567890123456';

test('Emirates ID: 784 prefix, 15 digits, Luhn check digit', () => {
  assert.equal(isEmiratesId(EID), true);
  assert.equal(isEmiratesId('784-1990-1234567-6'), true);
  assert.equal(isEmiratesId('784199012345677'), false);
  assert.equal(isEmiratesId('100123456700003'), false);
  assert.equal(maskEmiratesId(EID), '784-XXXX-XXX4567-6');
});

test('UAE IBAN: AE, 21 digits, mod 97', () => {
  assert.equal(isUaeIban(IBAN), true);
  assert.equal(isUaeIban('AE07 0331 2345 6789 0123 456'), true);
  assert.equal(isUaeIban('AE080331234567890123456'), false);
  assert.equal(maskUaeIban(IBAN), 'AE••••3456');
});

test('chat and audit text in the UAE edition mask Emirates IDs but keep TRNs and IBANs', () => {
  const said = `Customer Emirates ID 784-1990-1234567-6, TRN 100123456700003, pay to ${IBAN}`;
  const out = redactTinsFor('AE', said);
  assert.match(out, /784-XXXX-XXX4567-6/);
  assert.doesNotMatch(out, /1234567-6/);
  assert.match(out, /100123456700003/);
  assert.match(out, new RegExp(IBAN));
  assert.equal(redactEmiratesIds('invoice 784199012345677 total'), 'invoice 784199012345677 total');
  assert.deepEqual(redactTinsDeepFor('AE', { emiratesId: EID, note: `id ${EID}` }), { emiratesId: '784-XXXX-XXX4567-6', note: 'id 784-XXXX-XXX4567-6' });
  assert.equal(redactTinsFor('IN', `id ${EID}`), `id ${EID}`);
});

test('requests to the model provider from the UAE edition carry no Emirates ID or IBAN', () => {
  const body = {
    system: `Owner ${EID}`,
    messages: [
      { role: 'user', content: `Pay salary to ${IBAN} for ${EID}` },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'ae_payroll_run', input: { employees: [{ name: 'A', account: IBAN, labourId: '12345678901234' }] } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: `IBAN ${IBAN}` }] }] },
    ],
  };
  const sent = JSON.stringify(redactModelRequest(body, 'AE'));
  assert.doesNotMatch(sent, /784199012345676|1234567-6/);
  assert.doesNotMatch(sent, /0331234567890123456/);
  assert.match(sent, /AE••••3456/);
  assert.match(sent, /12345678901234/);
  assert.equal(redactUaeForModel('TRN 100123456700003'), 'TRN 100123456700003');
  assert.match(JSON.stringify(redactModelRequest(body, 'GB')), /784199012345676/);
});
