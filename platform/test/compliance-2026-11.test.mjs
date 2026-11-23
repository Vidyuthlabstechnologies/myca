import test from 'node:test';
import assert from 'node:assert/strict';
import { formLabel, formNumber, statementCode, underAct2025 } from '../src/it-act-forms.mjs';
import { runSandboxOperation } from '../src/sandbox-adapter.mjs';

test('Income-tax Rules 2026 form numbers apply from the tax year 2026-27, the 1961 forms before it', () => {
  assert.equal(underAct2025('2025-26'), false);
  assert.equal(underAct2025('Q4 2025-26'), false);
  assert.equal(underAct2025('2026-27'), true);
  assert.equal(underAct2025('2026-27 Q1'), true);
  assert.equal(underAct2025('2026-03-31'), false);
  assert.equal(underAct2025('2026-04-01'), true);
  assert.equal(formNumber('otherCertificate', 'Q4 2025-26'), '16A');
  assert.equal(formNumber('otherCertificate', 'Q1 2026-27'), '131');
  assert.equal(formNumber('salaryCertificate', '2026-27'), '130');
  assert.equal(formLabel('salaryStatement', '2026-27'), 'Form 138 (was Form 24Q)');
  assert.equal(formLabel('otherStatement', '2025-26'), 'Form 26Q');
  assert.equal(formLabel('annualStatement', '2026-27'), 'Form 168 (was Form 26AS)');
  assert.equal(statementCode('140'), '26Q');
  assert.equal(statementCode('Form 138'), '24Q');
  assert.equal(statementCode('144'), '27Q');
  assert.equal(statementCode('26q'), '26Q');
  assert.equal(statementCode('16A'), '');
});

test('e-way bill numbers of 14 digits (from 1 Jan 2027) are accepted next to the 12-digit ones', async () => {
  const state = { company: { gstin: '29AAACW6874H1ZS' }, invoices: [] };
  for (const ewbNo of ['123', '1234567890123', '123456789012345']) {
    const out = await runSandboxOperation({ actorId: 'ca', operationId: 'ewb_update_transporter', params: { ewbNo, transporterId: '29AAACW6874H1ZS' } }, { state });
    assert.equal(out.error, 'BAD_EWB_NO', ewbNo);
  }
  for (const ewbNo of ['123456789012', '12345678901234']) {
    const out = await runSandboxOperation({ actorId: 'ca', operationId: 'ewb_update_transporter', params: { ewbNo, transporterId: '29AAACW6874H1ZS' } }, { state });
    assert.notEqual(out.error, 'BAD_EWB_NO', ewbNo);
  }
});

test('Aadhaar numbers are swapped for placeholders before an India model call and put back in the tool input', async () => {
  const { isAadhaar, pseudonymiseAadhaar, restoreAadhaar, maskAadhaar } = await import('../src/india-identity.mjs');
  const { chooseTool, setModelTransport } = await import('../src/model-adapter.mjs');
  const base = '23456789012';
  const valid = [...'0123456789'].map((d) => base + d).find((n) => isAadhaar(n));
  assert.ok(valid, 'a Verhoeff-valid number exists');
  assert.equal(isAadhaar('123456789012'), false, 'Aadhaar never starts with 0 or 1');
  assert.equal(maskAadhaar(valid), `XXXX XXXX ${valid.slice(8)}`);
  const spaced = `${valid.slice(0, 4)} ${valid.slice(4, 8)} ${valid.slice(8)}`;
  const { body, vault } = pseudonymiseAadhaar({ messages: [{ role: 'user', content: `check pan ABCPK1234F with aadhaar ${spaced}, invoice 123456789012345` }] });
  assert.deepEqual(vault, [valid]);
  assert.match(body.messages[0].content, /aadhaar \[AADHAAR-1\], invoice 123456789012345$/);
  assert.deepEqual(restoreAadhaar({ aadhaarNumber: '[AADHAAR-1]' }, vault), { aadhaarNumber: valid });

  let seen = '';
  setModelTransport((sent) => {
    seen = JSON.stringify(sent);
    return { ok: true, response: { content: [{ type: 'tool_use', name: 'pan_aadhaar_status', input: { pan: 'ABCPK1234F', aadhaarNumber: '[AADHAAR-1]' } }] } };
  });
  try {
    const out = await chooseTool({ message: `is ABCPK1234F linked to ${valid}?`, tools: [{ name: 'pan_aadhaar_status', description: 'x', parameters: { type: 'object' } }], country: 'IN' });
    assert.equal(seen.includes(valid), false, 'the number never reaches the model');
    assert.equal(out.args.aadhaarNumber, valid);
  } finally {
    setModelTransport(null);
  }
});
