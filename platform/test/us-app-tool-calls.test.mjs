import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { PROPOSABLE } from '../../cloud/src/api.mjs';

const calls = JSON.parse(readFileSync(new URL('./fixtures/us-app-tool-calls.json', import.meta.url), 'utf8'));
const WRITES = new Set(['set_us_taxpayer', 'add_us_tax_form', 'remove_us_tax_form', 'answer_us_interview', 'import_us_prior_year', 'start_us_amended_return', 'set_us_amended_return', 'sign_us_return', 'file_us_return']);

test('the fixture recorded from the US app covers its writes and reads', () => {
  const tools = new Set(calls.map((call) => call.tool));
  for (const tool of [...WRITES, 'us_return_status', 'us_efile_status', 'us_interview', 'us_return_review', 'read_us_tax_document', 'us_amended_return']) assert.ok(tools.has(tool), `no recorded call for ${tool}`);
});

test('every argument set the US app sends passes the server\'s own tool schema', () => {
  const refused = [];
  for (const { tool, args } of calls) {
    const checked = validateAssistantToolCall(tool, args);
    if (!checked.ok) refused.push(`${tool}: ${checked.error} in ${JSON.stringify(args)}`);
  }
  assert.deepEqual(refused, [], 'The app and the server disagree. Fix the schema in platform/src/tool-schemas-us.mjs or the app; mobile/test/us_tool_contract_test.dart regenerates the fixture.');
});

test('the app reaches each tool the way the hosted API allows', () => {
  for (const { tool } of calls) {
    if (WRITES.has(tool)) assert.ok(PROPOSABLE.has(tool), `${tool} is sent to /api/propose but the hosted API does not accept it`);
    else assert.ok(isRemoteQuery(tool), `${tool} is sent to /api/query but is not a remote query`);
  }
});
