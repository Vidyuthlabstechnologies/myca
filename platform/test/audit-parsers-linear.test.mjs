import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asciiLower, soleCdata, withoutCdataMarks, xmlElements, xmlFirst, xmlOpenings, xmlSource } from '../src/xml-scan.mjs';
import { tallyXmlToDayBookCsv } from '../src/tally-xml.mjs';
import { parseTallyReply } from '../src/tally-push.mjs';
import { parseAcknowledgements } from '../src/us-mef-client.mjs';
import { SandboxClient } from '../src/sandbox-client.mjs';
import { NimClient } from '../src/nim-client.mjs';

const MB = 1024 * 1024;
const fill = (unit, bytes) => unit.repeat(Math.ceil(bytes / unit.length));
const LIMIT_MS = 4000;

function timed(run) {
  const started = process.hrtime.bigint();
  const out = run();
  return { out, ms: Number((process.hrtime.bigint() - started) / 1000000n) };
}

test('the scanner finds elements the way the readers need: by name, case, prefix and boundary', () => {
  const src = xmlSource('<a><Voucher X="1">one</VOUCHER><VOUCHERS>no</VOUCHERS><voucher>two</voucher></a>', { ignoreCase: true });
  assert.deepEqual(xmlElements(src, 'VOUCHER', { boundary: true, bare: true }).map((found) => found.outer), ['<Voucher X="1">one</VOUCHER>', '<voucher>two</voucher>']);
  assert.deepEqual(xmlElements(src, 'VOUCHER').map((found) => found.inner), ['one', 'no</VOUCHERS><voucher>two']);
  assert.equal(xmlFirst(src, 'voucher').inner, 'one');
  assert.equal(xmlFirst(xmlSource('<DATE>1'), 'DATE'), null, 'no closing tag, no element');
  assert.equal(xmlFirst(xmlSource('<DATE'), 'DATE'), null);
  const mef = xmlSource('<ns2:Ack><SubmissionId>1</SubmissionId></ns2:Ack><Ack a="b">2</Ack><x:y:Ack>3</x:y:Ack><:Ack>4</:Ack>');
  assert.deepEqual(xmlElements(mef, 'Ack', { prefixed: true }).map((found) => found.inner), ['<SubmissionId>1</SubmissionId>', '2']);
  assert.deepEqual(xmlElements(xmlSource('<E>a</E><E x>b</E><EE>c</EE>'), 'E', { exact: true }).map((found) => found.inner), ['a']);
  assert.deepEqual(xmlOpenings(xmlSource('<AMOUNT <AMOUNT>5</AMOUNT><amount>6'), 'AMOUNT').length, 1, 'two openings that share one closing bracket count once');
  assert.equal(asciiLower('İSTANBUL Ab').length, 'İSTANBUL Ab'.length, 'lowering never changes the length');
});

test('CDATA wrappers are removed without re-reading the text', () => {
  assert.equal(soleCdata('  <![CDATA[ a ]]> b ]]>\n'), ' a ]]> b ');
  assert.equal(soleCdata('<![CDATA[]]>'), '');
  assert.equal(soleCdata('x<![CDATA[a]]>'), null);
  assert.equal(withoutCdataMarks('a<![CDATA[b]]>c<![CDATA[d]]>e<![CDATA[open'), 'abcde<![CDATA[open');
});

test('a Tally file is read as before', () => {
  const xml = '<ENVELOPE><VOUCHER VCHTYPE="Sales"><DATE>20260401</DATE><VOUCHERNUMBER>7</VOUCHERNUMBER><PARTYLEDGERNAME><![CDATA[Kiran & Sons]]></PARTYLEDGERNAME><NARRATION>being &amp; sale</NARRATION><ALLLEDGERENTRIES.LIST><LEDGERNAME>Kiran</LEDGERNAME><AMOUNT>-1180.00</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><AMOUNT>1000</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER><voucher><date>2026-04-02</date><AMOUNT>50</AMOUNT></voucher><VOUCHER><DATE>20260403</DATE></ENVELOPE>';
  const out = tallyXmlToDayBookCsv(xml);
  assert.equal(out.ok, true);
  assert.equal(out.count, 2);
  const rows = out.csv.trim().split('\n');
  assert.match(rows[1], /^2026-04-01,Sales,7,Kiran & Sons,1180,,being & sale$/);
  assert.match(rows[2], /^2026-04-02,Journal,,Unknown,50,,$/);
});

test('a hostile Tally file is read in time proportional to its size', () => {
  const files = {
    'openings with no closing tag': fill('<VOUCHER ', 4 * MB),
    'fields that never close': fill('<VOUCHER><DATE>20260401', 4 * MB),
    'one voucher of date openings': `<VOUCHER>${fill('<DATE>', 4 * MB)}</VOUCHER>`,
    'one voucher of amount openings': `<VOUCHER><DATE>20260401</DATE>${fill('<AMOUNT', 4 * MB)}</VOUCHER>`,
    'one voucher of amount openings closed at the end': `<VOUCHER><DATE>20260401</DATE>${fill('<AMOUNT', 4 * MB)}>5</AMOUNT></VOUCHER>`,
    'one voucher of CDATA openings': `<VOUCHER><DATE>20260401</DATE><NARRATION>${fill('<![CDATA[', 4 * MB)}</NARRATION></VOUCHER>`,
    'one voucher of ledger openings': `<VOUCHER><DATE>20260401</DATE>${fill('<ALLLEDGERENTRIES.LIST>', 4 * MB)}</VOUCHER>`,
  };
  for (const [name, xml] of Object.entries(files)) {
    const { out, ms } = timed(() => tallyXmlToDayBookCsv(xml));
    assert.equal(out.ok, true, name);
    assert.ok(ms < LIMIT_MS, `${name} took ${ms} ms`);
  }
  const real = `<ENVELOPE>${fill('<VOUCHER VCHTYPE="Sales"><DATE>20260401</DATE><PARTYLEDGERNAME>A</PARTYLEDGERNAME><ALLLEDGERENTRIES.LIST><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER>', 4 * MB)}</ENVELOPE>`;
  const { out, ms } = timed(() => tallyXmlToDayBookCsv(real));
  assert.ok(out.count > 20000);
  assert.ok(ms < LIMIT_MS, `a full file took ${ms} ms`);
});

test('a hostile reply from Tally or from the IRS is read in time proportional to its size', () => {
  const reply = timed(() => parseTallyReply(fill('<LINEERROR>', 4 * MB)));
  assert.deepEqual(reply.out.lineErrors, []);
  assert.ok(reply.ms < LIMIT_MS, `Tally reply took ${reply.ms} ms`);
  assert.deepEqual(parseTallyReply('<RESPONSE><CREATED>2</CREATED><ALTERED>1</ALTERED><LINEERROR> Ledger  missing </LINEERROR><lineerror>x</lineerror></RESPONSE>'), { created: 2, altered: 1, errors: 2, lineErrors: ['Ledger missing', 'x'] });
  for (const xml of [fill('<Acknowledgement>', 4 * MB), fill('<ns2:Acknowledgement><SubmissionId>', 4 * MB), `<Acknowledgement>${fill('<ValidationErrorGrp>', 4 * MB)}</Acknowledgement>`]) {
    const ack = timed(() => parseAcknowledgements(xml));
    assert.ok(ack.ms < LIMIT_MS, `acknowledgements took ${ack.ms} ms`);
  }
  const acks = parseAcknowledgements('<ns2:AcknowledgementList><ns2:Acknowledgement><ns2:SubmissionId>S1</ns2:SubmissionId><ns2:AcceptanceStatusTxt>Rejected</ns2:AcceptanceStatusTxt><ns2:TaxYr>2025</ns2:TaxYr><ns2:ValidationErrorGrp errorId="1"><ns2:RuleNum>F1040-001</ns2:RuleNum><ns2:ErrorMessageTxt>bad</ns2:ErrorMessageTxt></ns2:ValidationErrorGrp></ns2:Acknowledgement></ns2:AcknowledgementList>');
  assert.equal(acks.length, 1);
  assert.equal(acks[0].submissionId, 'S1');
  assert.equal(acks[0].status, 'Rejected');
  assert.equal(acks[0].taxYear, 2025);
  assert.deepEqual(acks[0].errors, [{ ruleNumber: 'F1040-001', severity: '', message: 'bad', xpath: '' }]);
});

test('the Sandbox client sends its keys to the Sandbox host only and refuses redirects', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ access_token: 'tok', expires_in: 60 }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const client = new SandboxClient({ apiKey: 'key_test_12345678', apiSecret: 'secret_test_12345678', baseUrl: 'https://test-api.sandbox.co.in', environment: 'test', fetchFn });
  for (const endpoint of ['https://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/x', 'https://test-api.sandbox.co.in.evil.example/x', 'https://evil.example/gst', 'file:///etc/passwd']) {
    const out = await client.request(endpoint, { body: {} });
    assert.equal(out.error, 'ENDPOINT_HOST_REFUSED', endpoint);
  }
  assert.equal(calls.some((call) => !call.url.startsWith('https://test-api.sandbox.co.in/')), false, JSON.stringify(calls.map((call) => call.url)));
  await client.request('/gst/compliance/public/gstin/search', { body: { gstin: '29ABCDE1234F1Z5' } });
  assert.ok(calls.length >= 2);
  for (const call of calls) assert.equal(call.init.redirect, 'error', call.url);
});

test('the second model client refuses redirects too', async () => {
  const calls = [];
  const client = new NimClient({ apiKey: 'nvapi-test', fetchFn: async (url, init) => { calls.push(init); return new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 }); } });
  await client.ping();
  await client.complete({ prompt: 'hello' });
  assert.ok(calls.length >= 2);
  for (const init of calls) assert.equal(init.redirect, 'error');
});
