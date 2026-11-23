import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROPOSABLE } from '../src/api.mjs';
import { TOOL_ARG_SCHEMAS } from '../../platform/src/tool-schemas.mjs';

test('the Reports screen of the app can save and delete a report through the hosted API', () => {
  for (const name of ['save_report', 'delete_report']) {
    assert.ok(TOOL_ARG_SCHEMAS[name], name);
    assert.equal(PROPOSABLE.has(name), true, name);
  }
});
