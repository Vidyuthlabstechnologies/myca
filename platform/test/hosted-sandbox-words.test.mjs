import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelConfig } from '../src/model-adapter.mjs';

test('a model key left as the Terraform placeholder counts as no key', () => {
  const before = process.env.MYCA_MODEL_API_KEY;
  process.env.MYCA_MODEL_API_KEY = 'unset';
  try {
    assert.equal(modelConfig().configured, false);
    assert.equal(modelConfig().apiKey, '');
  } finally {
    if (before === undefined) delete process.env.MYCA_MODEL_API_KEY;
    else process.env.MYCA_MODEL_API_KEY = before;
  }
});

test('a hosted dry run says nothing was sent, not how to edit platform/.env', async () => {
  const { createState } = await import('../src/store.mjs');
  const { performExternalAction } = await import('../src/action-gate.mjs');
  const saved = { live: process.env.MYCA_ENABLE_LIVE_CALLS, mock: process.env.MYCA_MOCK_MODE, hosted: process.env.MYCA_HOSTED };
  Object.assign(process.env, { MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0', MYCA_HOSTED: '1' });
  try {
    const out = await performExternalAction(createState(), { actionId: 'einvoice_authenticate', clientId: 'self', params: { gstin: '27AABCU9603R1ZN' }, actor: { userId: 'ca', role: 'staff' } }, async () => ({ ok: true }));
    assert.equal(out.error, 'LIVE_CALLS_DISABLED');
    assert.match(out.hint, /Nothing was sent/);
    assert.doesNotMatch(out.hint, /platform\/\.env/);
  } finally {
    for (const [key, value] of [['MYCA_ENABLE_LIVE_CALLS', saved.live], ['MYCA_MOCK_MODE', saved.mock], ['MYCA_HOSTED', saved.hosted]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
