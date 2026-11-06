import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../src/intent.mjs';

test('"sold <goods> to <customer>" names the customer, not the goods', () => {
  assert.equal(parseDocument('Sold supplies to Kiran Stores for 8000 plus 18% GST').partyName, 'Kiran Stores');
  assert.equal(parseDocument('Sold 10 rolls to Ravi Traders at 500 18% gst').partyName, 'Ravi Traders');
  assert.equal(parseDocument('sold to Kiran Stores 8000 at 18%').partyName, 'Kiran Stores');
  assert.equal(parseDocument('invoice for Asha Textiles 5000 gst 12%').partyName, 'Asha Textiles');
  assert.equal(parseDocument('bought cloth from Mehta Mills 3000 12% gst').partyName, 'Mehta Mills');
});
