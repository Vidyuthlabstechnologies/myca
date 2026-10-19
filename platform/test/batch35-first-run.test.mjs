import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-firstrun-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSession } from '../src/session.mjs';
import { freshBooks } from '../src/store-ports.mjs';

test('a fresh install opens with a blank business that asks to be set up; naming it ends the setup; an existing file is left alone', async () => {
  const path = join(process.env.APPDATA, 'first', 'state.json');
  assert.equal(existsSync(path), false);
  const session = openSession(path);
  assert.equal(session.state.company.setupNeeded, true);
  assert.equal(session.state.company.name, '');
  assert.equal(session.state.company.gstin, '');
  assert.match(session.state.company.fy, /^\d{4}-\d{2}$/);
  assert.equal(session.state.invoices.length, 0);
  const refused = await session.tool('create_invoice', { partyName: 'Early Bird', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }], date: '2026-09-01' });
  assert.notEqual(refused.ok, true, 'nothing posts before the business has a state');
  const set = await session.updateCompany({ name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN' });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(session.state.company.setupNeeded, undefined);
  assert.equal(session.state.company.state, '27');
  assert.equal(session.state.company.pan, 'AABCU9603R');
  const again = openSession(path);
  assert.equal(again.state.company.setupNeeded, undefined);
  assert.equal(again.state.company.name, 'Nalanda Textiles');
  assert.equal(freshBooks('2026-02-10').company.fy, '2025-26');
  assert.equal(freshBooks('2026-04-01').company.fy, '2026-27');
});
