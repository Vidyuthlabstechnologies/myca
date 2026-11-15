#!/usr/bin/env node

const [base = 'http://127.0.0.1:8080', consoleKey = process.env.MYCA_SANDBOX_CONSOLE_KEY || ''] = process.argv.slice(2);
const code = process.env.MYCA_TEST_CODE || '246810';
const results = [];
const step = (app, name, ok, detail = '') => {
  results.push({ app, name, ok: Boolean(ok), detail: ok ? '' : String(detail).slice(0, 300) });
  return Boolean(ok);
};

let prefix = '';
async function call(path, { method = 'GET', token, body, cookie, json = true } = {}) {
  const res = await fetch(`${base}${path.startsWith('/v1/') ? prefix : ''}${path}`, { method, redirect: 'manual', headers: { 'content-type': 'application/json', accept: json ? 'application/json' : 'text/html', 'ngrok-skip-browser-warning': '1', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch { parsed = {}; }
  return { status: res.status, body: parsed, text };
}

async function signIn(app, phone, region) {
  const otp = await call('/v1/auth/otp', { method: 'POST', body: { phone } });
  step(app, `ask for a sign-in code for ${phone}`, otp.status === 200, otp.text);
  const verified = await call('/v1/auth/verify', { method: 'POST', body: { challengeId: otp.body.challengeId, phone, code, deviceLabel: 'sandbox check' } });
  step(app, 'sign in with the fixed test code', verified.status === 200 && verified.body.accessToken, verified.text);
  const token = verified.body.accessToken;
  const notice = await call(`/v1/privacy-notice?region=${region}`, { token });
  const current = notice.body.notice || {};
  const agreed = await call('/v1/me/consent', { method: 'POST', token, body: { document: current.document, version: current.version, adult: true } });
  step(app, 'accept the privacy notice', agreed.status === 200, `${notice.text} ${agreed.text}`);
  return token;
}

function tools(token, id) {
  const at = (action, body) => call(`/v1/businesses/${id}/${action}`, { method: 'POST', token, body });
  const write = async (name, args) => {
    const proposed = await at('propose', { name, args });
    if (!proposed.body.preview?.token) return proposed;
    return at('confirm', { token: proposed.body.preview.token });
  };
  const result = (out, name) => out.body.tools?.find((t) => t.name === name)?.result || out.body.result || {};
  return { at, write, result };
}

async function india() {
  const app = 'India';
  prefix = '/in';
  const token = await signIn(app, '+919000000001', 'IN');
  const states = await call('/v1/states', { token });
  const karnataka = (states.body.states || []).find((s) => s.name === 'Karnataka');
  const created = await call('/v1/businesses', { method: 'POST', token, body: { name: `Sandbox Traders ${Date.now()}`, state: karnataka?.code || '29' } });
  step(app, 'create a business', created.status === 200, created.text);
  const id = created.body.business?.id;
  const { at, write, result } = tools(token, id);
  const sale = await write('create_invoice', { partyName: 'Sandbox Buyer', partyGstin: '', lines: [{ description: 'Sandbox supply', qty: 2, rate: 1000, gstRate: 18 }] });
  step(app, 'raise a GST invoice (CGST + SGST)', sale.status === 200 && result(sale, 'create_invoice').ok !== false, sale.text);
  const invoices = await at('query', { name: 'list_invoices', args: {} });
  step(app, 'the invoice list reads the sale back', invoices.status === 200 && invoices.text.includes('Sandbox Buyer'), invoices.text);
  const summary = await at('query', { name: 'business_summary', args: {} });
  step(app, 'business summary (Today screen)', summary.status === 200 && summary.body.ok !== false, summary.text);
  const period = new Date().toISOString().slice(0, 7);
  const gstr1 = await at('query', { name: 'export_gstr1_json', args: { period } });
  step(app, `GSTR-1 for ${period} JSON builds from the books`, gstr1.status === 200 && gstr1.body.ok !== false, gstr1.text);
  const gstr3b = await at('query', { name: 'gst_period_summary', args: { period } });
  step(app, `GST summary (3B figures) for ${period}`, gstr3b.status === 200 && gstr3b.body.ok !== false, gstr3b.text);
  const gstin = '29AAACM1234F1ZU';
  const registered = await call('/v1/businesses', { method: 'POST', token, body: { name: `Sandbox GST Co ${Date.now()}`, state: '29', gstin } });
  step(app, 'create a GST-registered business', registered.status === 200, registered.text);
  const gid = registered.body.business?.id;
  const g = tools(token, gid);
  const b2b = await g.write('create_invoice', { partyName: 'Sandbox B2B Buyer', partyGstin: '27AAPFU0939F1ZV', lines: [{ description: 'Goods', qty: 1, rate: 60000, gstRate: 18, hsn: '8471' }] });
  step(app, 'raise an inter-state B2B invoice (IGST)', b2b.status === 200 && g.result(b2b, 'create_invoice').ok !== false, b2b.text);
  const portal = (body) => call(`/v1/businesses/${gid}/gst-portal`, { method: 'POST', token, body });
  step(app, 'GST portal: ask for the OTP (simulated)', (await portal({ step: 'otp', gstin, username: 'sandbox' })).body.otpSent === true);
  const connected = await portal({ step: 'verify', gstin, username: 'sandbox', otp: '575757' });
  step(app, 'GST portal: connect with the OTP (simulated)', connected.body.connected === true, connected.text);
  const saved = await call(`/v1/businesses/${gid}/gst-gstr1`, { method: 'POST', token, body: { step: 'save', period } });
  step(app, 'save GSTR-1 to the portal (simulated reference)', saved.body.save?.referenceId, saved.text);
  const filedEarly = await call(`/v1/businesses/${gid}/gst-gstr1`, { method: 'POST', token, body: { step: 'file', period, otp: '575757', pan: 'AAACM1234F' } });
  step(app, 'filing before the GST review is approved is refused', filedEarly.body.error === 'REVIEW_NOT_APPROVED', filedEarly.text);
  let review = await g.at('query', { name: 'gst_review', args: { period } });
  for (let turn = 0; turn < 12 && review.body.data && !review.body.data.approved; turn += 1) {
    const data = review.body.data;
    const next = data.steps.find((item) => item.id === data.next) || data.steps.find((item) => !item.waitingFor && !data.answers?.[item.id]);
    if (!next) break;
    const answered = await g.write('gst_review_answer', { period, step: next.id, answer: next.id === 'approve' ? 'approve' : 'correct', draftHash: data.draftHash });
    if (answered.status !== 200) break;
    review = await g.at('query', { name: 'gst_review', args: { period } });
  }
  step(app, 'walk and approve the GST review', review.body.data?.approved === true, review.text);
  const filed = await call(`/v1/businesses/${gid}/gst-gstr1`, { method: 'POST', token, body: { step: 'file', period, otp: '575757', pan: 'AAACM1234F' } });
  step(app, 'file GSTR-1 with the EVC OTP (simulated acknowledgement)', filed.body.ok !== false && filed.status === 200, filed.text);
  const saved3b = await call(`/v1/businesses/${gid}/gst-gstr3b`, { method: 'POST', token, body: { step: 'save', period } });
  step(app, 'save GSTR-3B to the portal (simulated reference)', saved3b.body.save?.referenceId, saved3b.text);
  const live = await call('/v1/health/live');
  step(app, 'server says sandbox (government calls simulated or Quicko test)', ['simulated', 'test'].includes(live.body.providerMode) && live.body.environment !== 'production', live.text);
}

async function us() {
  const app = 'US';
  prefix = '/us';
  const token = await signIn(app, '+12025550143', 'US');
  const created = await call('/v1/businesses', { method: 'POST', token, body: { name: 'Sandbox Filer', country: 'US', kind: 'household' } });
  step(app, 'create a household', created.status === 200, created.text);
  const id = created.body.business?.id;
  const { at, write, result } = tools(token, id);
  const taxYear = 2025;
  step(app, 'taxpayer profile with a sealed SSN', (await write('set_us_taxpayer', { taxYear: String(taxYear), filingStatus: 'single', taxpayer: { firstName: 'Sam', lastName: 'Sandbox', ssn: '400-12-3470', dateOfBirth: '1990-01-15', occupation: 'Analyst' }, address: { line1: '1 Test Way', city: 'Columbus', state: 'OH', zip: '43215' } })).status === 200);
  step(app, 'add a W-2', (await write('add_us_tax_form', { taxYear: String(taxYear), kind: 'W-2', payer: 'Sandbox Corp', payerTin: '12-3456784', fields: { wages: 64000, federalWithheld: 9000, socialSecurityWages: 64000, socialSecurityTax: 3968, medicareWages: 64000, medicareTax: 928 } })).status === 200);
  const review = await at('query', { name: 'us_return_review', args: { taxYear } });
  step(app, 'review the 1040', review.status === 200 && !review.text.includes('400123470'), review.text);
  const checkout = await at('us-checkout', { product: 'return', taxYear });
  step(app, 'open the filing-fee checkout on the public console', checkout.status === 200 && checkout.body.url?.startsWith(base), checkout.text);
  const page = await call(new URL(checkout.body.url || base).pathname, { json: false });
  step(app, 'the checkout page opens from the phone without the console key', page.status === 200 && page.text.includes('Pay with test card'), page.text);
  const paid = await call(`${new URL(checkout.body.url || base).pathname}/pay`, { method: 'POST', body: {} });
  step(app, 'pay with the test card (signed Stripe webhook)', paid.body.webhook?.recorded === true, paid.text);
  const purchase = await call(`/v1/businesses/${id}/us-return-purchase?taxYear=${taxYear}`, { token });
  step(app, 'the return shows as paid', purchase.body.paid === true, purchase.text);
  const filed = await write('file_us_return', { taxYear });
  step(app, 'file through the e-file partner', filed.status === 200 && result(filed, 'file_us_return').ok === true, filed.text);
  if (!consoleKey) return step(app, 'partner events (needs the console key)', false, 'no console key given');
  const login = await call(`/?k=${consoleKey}`, { json: false });
  const cookie = String(login.status === 303 ? `myca_sandbox=${consoleKey}` : '');
  const blocked = await call('/state');
  step(app, 'the console is closed without the key', blocked.status === 403, blocked.text);
  const state = await call('/state', { cookie });
  const session = (state.body.partnerSessions || []).find((s) => s.externalId.startsWith(`myca.${id}.`));
  step(app, 'partner session opened without the SSN', session && !session.ssnSent, state.text);
  for (const kind of ['submitted', 'accepted']) {
    const sent = await call(`/partner/${encodeURIComponent(session?.externalId || 'x')}/${kind}`, { method: 'POST', cookie, body: {} });
    step(app, `partner reports ${kind}`, sent.body.status === kind, sent.text);
  }
  const status = await at('query', { name: 'us_efile_status', args: { taxYear } });
  const data = status.body.data ?? status.body.result?.data ?? status.body;
  step(app, 'the 1040 hub shows accepted', data.status === 'accepted', status.text);
}

for (const run of [india, us]) {
  try { await run(); } catch (err) { step(run.name, 'unexpected error', false, err?.stack || err); }
}
for (const r of results) console.log(`${r.ok ? 'PASSED' : 'FAILED'}  ${r.app.padEnd(5)} ${r.name}${r.ok ? '' : `\n        ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed against ${base}`);
process.exit(failed ? 1 : 0);
