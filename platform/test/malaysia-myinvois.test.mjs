import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, verify, X509Certificate } from 'node:crypto';
import { buildMyInvoisDocument, documentProblems, submissionEntry, stateCode, SPECIAL_TINS } from '../src/countries/malaysia/myinvois-document.mjs';
import { signMyInvoisDocument, unsignedCopy } from '../src/countries/malaysia/myinvois-sign.mjs';
import { submitMyInvoisDocuments, myInvoisToken, cancelMyInvoisDocument, clearMyInvoisTokens, MYINVOIS_HOSTS } from '../src/countries/malaysia/myinvois-client.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/malaysia/${name}`, import.meta.url), 'utf8');

function invoice(overrides = {}) {
  return {
    type: 'invoice',
    number: 'INV-2026-0001',
    issueDate: '2026-11-11',
    issueTime: '09:30:00Z',
    supplier: {
      name: 'Kedai Contoh Sdn Bhd', tin: 'C20830570210', idType: 'BRN', idValue: '202001234567', sst: 'W10-1808-32000001',
      msic: '46510', phone: '+60123456789', email: 'billing@example.my',
      address: { lines: ['Lot 66, Bangunan Merdeka'], city: 'Kuala Lumpur', postcode: '50480', state: 'Wilayah Persekutuan Kuala Lumpur' },
    },
    buyer: {
      name: 'Pelanggan Bhd', tin: 'C10987654320', idType: 'BRN', idValue: '199901000111', phone: '+60387654321',
      address: { lines: ['Jalan Ampang'], city: 'Kuala Lumpur', state: '14' },
    },
    lines: [
      { description: 'Consulting, October', classification: '022', quantity: 10, unitPrice: 300, taxType: '02', taxRateBasisPoints: 800 },
      { description: 'Laptop bag', classification: '022', quantity: 2, unitPrice: 50, discount: 10, taxType: '01', taxRateBasisPoints: 1000 },
    ],
    ...overrides,
  };
}

test('state names and codes both resolve', () => {
  assert.equal(stateCode('Selangor'), '10');
  assert.equal(stateCode('14'), '14');
  assert.equal(stateCode('7'), '07');
  assert.equal(stateCode('Atlantis'), '');
});

test('a complete invoice builds a UBL 2.1 v1.1 document with correct totals', () => {
  const out = buildMyInvoisDocument(invoice());
  assert.equal(out.ok, true, JSON.stringify(out.problems));
  const doc = out.document.Invoice[0];
  assert.deepEqual(doc.InvoiceTypeCode, [{ _: '01', listVersionID: '1.1' }]);
  assert.equal(out.totals.net, 3090);
  assert.equal(out.totals.tax, 249);
  assert.equal(out.totals.payable, 3339);
  assert.equal(doc.LegalMonetaryTotal[0].PayableAmount[0]._, 3339);
  assert.equal(doc.TaxTotal[0].TaxSubtotal.length, 2);
  const supplier = doc.AccountingSupplierParty[0].Party[0];
  assert.equal(supplier.IndustryClassificationCode[0]._, '46510');
  assert.ok(supplier.IndustryClassificationCode[0].name.length > 0);
  assert.equal(supplier.PostalAddress[0].CountrySubentityCode[0]._, '14');
  assert.deepEqual(supplier.PartyIdentification.map((id) => id.ID[0].schemeID), ['TIN', 'BRN', 'SST', 'TTX']);
  assert.equal(doc.InvoiceLine[1].LineExtensionAmount[0]._, 90);
  assert.equal(doc.InvoiceLine[1].ItemPriceExtension[0].Amount[0]._, 100);
});

test('missing or wrong fields are listed, not guessed', () => {
  const broken = invoice({ supplier: { ...invoice().supplier, msic: '99', tin: 'nope' }, lines: [{ description: '', classification: 'x', taxType: '9', unitPrice: -1 }] });
  const fields = documentProblems(broken).map((problem) => problem.field);
  for (const field of ['supplier.msic', 'supplier.tin', 'lines[0].description', 'lines[0].classification', 'lines[0].taxType', 'lines[0].unitPrice']) assert.ok(fields.includes(field), field);
  assert.equal(buildMyInvoisDocument(broken).error, 'EINVOICE_FIELDS_MISSING');
});

test('a credit note must name the e-invoice it adjusts; general public buyers need no ID', () => {
  const note = invoice({ type: 'credit-note' });
  assert.ok(documentProblems(note).some((problem) => problem.field === 'original.uuid'));
  const fixed = buildMyInvoisDocument({ ...note, original: { uuid: 'F9D425P6DS7D8IU2Z9WTDYCZ4X', number: 'INV-2026-0001' } });
  assert.equal(fixed.ok, true);
  assert.equal(fixed.document.Invoice[0].BillingReference[0].InvoiceDocumentReference[0].UUID[0]._, 'F9D425P6DS7D8IU2Z9WTDYCZ4X');
  const publicBuyer = invoice({ buyer: { name: 'General Public', tin: SPECIAL_TINS['general-public'], address: { city: 'NA', state: '17', country: 'MYS' } } });
  assert.deepEqual(documentProblems(publicBuyer).filter((problem) => problem.field.startsWith('buyer')), []);
});

test('from 2026 a line above RM10,000 cannot sit in a consolidated e-invoice', () => {
  const big = invoice({ consolidated: true, lines: [{ description: 'Daily sales', classification: '004', quantity: 1, unitPrice: 12000, taxType: '06' }] });
  assert.ok(documentProblems(big).some((problem) => /own e-invoice/.test(problem.why)));
});

test('the submission entry is base64 of the minified JSON with its SHA-256', () => {
  const { document } = buildMyInvoisDocument(invoice());
  const entry = submissionEntry(document, 'INV-2026-0001');
  const json = Buffer.from(entry.document, 'base64').toString('utf8');
  assert.equal(json, JSON.stringify(document));
  assert.equal(entry.documentHash, createHash('sha256').update(json).digest('hex'));
  assert.equal(entry.format, 'JSON');
});

test('the v1.1 signature verifies against the certificate and carries all three digests', () => {
  const { document } = buildMyInvoisDocument(invoice());
  const certificatePem = fixture('test-signer.crt');
  const out = signMyInvoisDocument(document, { certificatePem, privateKeyPem: fixture('test-signer.key'), signingTime: new Date('2026-11-11T09:30:00Z') });
  assert.equal(out.ok, true, out.error);
  const signed = out.document.Invoice[0];
  const info = signed.UBLExtensions[0].UBLExtension[0].ExtensionContent[0].UBLDocumentSignatures[0].SignatureInformation[0].Signature[0];
  const minified = Buffer.from(JSON.stringify(unsignedCopy(out.document)));
  assert.equal(JSON.stringify(unsignedCopy(out.document)), JSON.stringify(document));
  assert.equal(info.SignedInfo[0].Reference[1].DigestValue[0]._, createHash('sha256').update(minified).digest('base64'));
  const certificate = new X509Certificate(certificatePem);
  assert.equal(verify('sha256', minified, certificate.publicKey, Buffer.from(info.SignatureValue[0]._, 'base64')), true);
  const props = info.Object[0].QualifyingProperties[0].SignedProperties;
  assert.equal(info.SignedInfo[0].Reference[0].DigestValue[0]._, createHash('sha256').update(JSON.stringify({ Target: 'signature', SignedProperties: props })).digest('base64'));
  assert.equal(props[0].SignedSignatureProperties[0].SigningTime[0]._, '2026-11-11T09:30:00Z');
  assert.match(out.certificate.issuer, /CN=MYCA TEST ONLY/);
  assert.equal(signed.Signature[0].ID[0]._, 'urn:oasis:names:specification:ubl:signature:Invoice');
});

test('signing refuses a missing certificate or a key that does not match', () => {
  const { document } = buildMyInvoisDocument(invoice());
  assert.equal(signMyInvoisDocument(document, {}).error, 'SIGNING_CERTIFICATE_MISSING');
});

function fakeFetch(log, { tokenStatus = 200 } = {}) {
  return async (url, options) => {
    log.push({ url, options });
    if (url.endsWith('/connect/token')) {
      return new Response(JSON.stringify(tokenStatus === 200 ? { access_token: 'jwt-1', token_type: 'Bearer', expires_in: 3600 } : { error: 'invalid_client' }), { status: tokenStatus });
    }
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({ submissionUid: 'HJSD135P2S7D8IU2Z9WTDYCZ4X', acceptedDocuments: body.documents.map((doc) => ({ uuid: 'F9D425P6DS7D8IU2Z9WTDYCZ4X', invoiceCodeNumber: doc.codeNumber })), rejectedDocuments: [] }), { status: 202 });
  };
}

beforeEach(() => clearMyInvoisTokens());

test('the client logs in once, reuses the token and submits to the sandbox host', async () => {
  const log = [];
  const config = { environment: 'test', clientId: 'id', clientSecret: 'secret', onBehalfOf: 'C20830570210', fetch: fakeFetch(log) };
  const { document } = buildMyInvoisDocument(invoice());
  const first = await submitMyInvoisDocuments(config, { documents: [{ document, codeNumber: 'INV-2026-0001' }] });
  const second = await submitMyInvoisDocuments(config, { documents: [{ document, codeNumber: 'INV-2026-0002' }] });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.data.acceptedDocuments[0].invoiceCodeNumber, 'INV-2026-0001');
  assert.equal(log.filter((entry) => entry.url.endsWith('/connect/token')).length, 1);
  assert.equal(log[0].url, `${MYINVOIS_HOSTS.test.api}/connect/token`);
  assert.equal(log[0].options.headers.onbehalfof, 'C20830570210');
  assert.match(log[0].options.body, /grant_type=client_credentials/);
  assert.equal(log[1].url, `${MYINVOIS_HOSTS.test.api}/api/v1.0/documentsubmissions/`);
  assert.equal(log[1].options.headers.Authorization, 'Bearer jwt-1');
});

test('production needs an approval, off means no call, and a failed login is reported', async () => {
  const log = [];
  const { document } = buildMyInvoisDocument(invoice());
  const live = await submitMyInvoisDocuments({ environment: 'live', clientId: 'id', clientSecret: 's', fetch: fakeFetch(log) }, { documents: [{ document, codeNumber: 'A' }] });
  assert.equal(live.error, 'APPROVAL_REQUIRED');
  assert.equal(log.length, 0);
  const off = await myInvoisToken({ clientId: 'id', clientSecret: 's', fetch: fakeFetch(log) });
  assert.equal(off.error, 'LIVE_CALLS_DISABLED');
  const bad = await myInvoisToken({ environment: 'test', clientId: 'id', clientSecret: 's', fetch: fakeFetch(log, { tokenStatus: 400 }) });
  assert.equal(bad.error, 'MYINVOIS_LOGIN_FAILED');
  assert.equal(bad.lhdn.error, 'invalid_client');
  assert.equal((await cancelMyInvoisDocument({ environment: 'test' }, { uuid: 'F9D425P6DS7D8IU2Z9WTDYCZ4X' })).error, 'CANCEL_REASON_REQUIRED');
  assert.equal((await submitMyInvoisDocuments({ environment: 'test' }, { documents: [] })).error, 'SUBMISSION_TOO_LARGE_OR_EMPTY');
});
