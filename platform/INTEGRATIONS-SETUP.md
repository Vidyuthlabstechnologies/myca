# MyCA — Integrations Setup

How to turn each external integration from "wired" to "live". Nothing here requires
code changes: every step is a credential or a config line. Run
`provider_doctor` (APIs tab → **Run integration doctor**) after each step.

## 0. Ground rules

- **Outbound calls are off by default.** Nothing reaches a provider until
  `MYCA_ENABLE_LIVE_CALLS=1` is set in `platform/.env`.
- **Mock everything with one flag.** `MYCA_MOCK_MODE=1` (already set in the shipped
  `.env`) makes every provider front door — Sandbox by Quicko, NIC e-invoice,
  notifications, NVIDIA NIM — return deterministic simulated fixtures tagged
  `mock:true`. No keys, no live switch, no CA approvals, no network. Demos, walkthroughs
  and workflow testing just work. Set it back to `0` the moment you go live.
- **Secrets never go in `state.json`.** Provider/NIC credentials are encrypted at rest
  by the credential vault (Electron `safeStorage`/DPAPI; AES-256-GCM under plain Node).
- **Filing/signing/OTP/DSC stay CA-controlled.** Gated operations need an approved,
  single-use CA approval (`approval_request` → `approval_decide` → `sandbox_operation`).
- Config lives in `platform/.env` (git-ignored). Copy `platform/.env.example` to start.

## 1. Sandbox by Quicko — GSTIN, returns, income tax, TDS, GSTR-2B job

Sandbox is the provider API MyCA already speaks.

1. Create an account at <https://developer.sandbox.co.in> and generate an API key/secret.
2. Set:

   ```
   MYCA_GSP_BASE_URL=https://api.sandbox.co.in   # NOTE: test-api.sandbox.co.in is the TEST host
   MYCA_GSP_ENV=live
   MYCA_GSP_LIVE_API_KEY=<live key>
   MYCA_GSP_LIVE_API_SECRET=<live secret>
   MYCA_ENABLE_LIVE_CALLS=1
   ```

3. Verify: `provider_doctor` should show `sandbox [live] reachable`. `sandbox_status`
   prints the environment and key source.

   Or skip the `.env` step: open **Sandbox keys** (top right of the desktop tabs, or
   <http://127.0.0.1:4780/keys.html>), paste the key and secret, choose Test or Live, and
   click **Save and test**. The keys are encrypted in the local vault
   (`%APPDATA%\MyCA\sandbox.json`), every sandbox call uses them from then on, and the
   page runs `sandbox_status` and `provider_doctor` straight away. `.env` variables, when
   set, still win. The same page saves the NIC e-invoice sandbox credentials.

Reference: the full documentation index is at <https://developer.sandbox.co.in/llms.txt>
(GST, TDS and Income Tax overviews, authentication, errors, rate limits) and the official
SDKs and samples at <https://github.com/in-co-sandbox>. MyCA uses the GST compliance and
analytics routes (GSTIN, returns, GSTR-2B job, e-invoice) and the TDS e-file job; the
Income Tax calculator, report and Form 16 OCR routes are not wired.

**Endpoint status (verified live against TEST):** auth, GSTIN search/verify, and the
GSTR-2B reconciliation job (returns a real `job_id` + signed upload URLs) all work.
Taxpayer OTP, e-invoice auth, and TDS FVU/analytics accept the request with the correct
route and payload. The public return-tracking route works, though the TEST fixture
rejects every financial-year value tried.

**Not wired:** the income-tax calculator. Sandbox publishes no stable path for it (the
reference page is an empty stub), so MyCA refuses to guess and `income_tax_calculate`
returns `PROVIDER_ENDPOINT_UNDOCUMENTED` — use `prepare_itr` (sprint-5 engine).

**Gotcha:** the TEST host (`test-api.sandbox.co.in`) returns the *same fixture record for
every GSTIN*. If every lookup returns the same taxpayer, you are on TEST. MyCA warns
about this.

**Not enough for filing:** GST taxpayer flows (GSTR-1 save/file) require **GSP/ASP
onboarding** with Quicko or another GSP. MyCA is not a GSP and will not pretend to be one.

## 2. NIC e-invoice (direct IRP path)

**Hosts (hard-coded, no changes needed):** sandbox = `https://einv1api.gstsandbox.nic.in`
(and `einv2api` as a second gateway), production = `https://einvoice1.gst.gov.in`.
The old `api.einvoice.gst.gov.in` address is not used.

**What MyCA sends:** auth payload is RSA-encrypted with the loaded `.cer` public key;
every IRN/e-Way Bill payload is wrapped as `{ Data: <AES-256-ECB(PKCS7)> }` with the
session `Sek` returned by auth. Responses are AES-decrypted with the same `Sek`.
Nothing is sent in clear. All IRP calls are gated by the live switch
(`MYCA_ENABLE_LIVE_CALLS`) and a CA approval.

1. Register an **API user** for the GSTIN on the portal:
   - Sandbox: `https://einv-apisandbox.nic.in` → **User Type = Tax Payer**, GSTIN,
     Trade Name exactly as on the GST certificate, GST-registered mobile + email (OTP
     goes to that mobile). You receive the **client-id / client-secret**.
   - Production: register on `einvoice1.gst.gov.in` after completing the NIC production
     on-boarding (static source IPs + test report).
2. Download the IRP/sandbox **public key (.cer)** for the portal environment.
3. In MyCA → **Govt** tab: fill environment, client-id, client-secret, API user, API
   password, GSTIN → **Save on this PC**.
4. Paste the `.cer` path (or PEM text) into **Public key** → **Load public key**.
   MyCA validates it is a real RSA key and stores it; it **refuses to send credentials
   unencrypted**.
5. Chat:
   - `nic health` → pings the heartbeat endpoint (no credentials needed).
   - `nic auth` → auth + session `Sek`, `nic session` shows token expiry.
   - `generate irn INV-0001` → mock-first (`mock: true`), re-run with the live switch on
     to hit the IRP.
   - `govt_nic_cancel_irn`, `govt_nic_get_irn`, `govt_nic_get_irn_by_doc`,
     `govt_nic_rejected_irns`, `govt_nic_gstin`, `govt_nic_generate_ewb`,
     `govt_nic_get_ewb` → remaining IRP operations (all live-gated).

Verify: `provider_doctor` → `nic_einvoice` shows `configured` (all six pieces present).

**Caveats:**
- E-Way Bill **cancel** is not offered by the IRP; MyCA returns
  `EWB_CANCEL_VIA_EWB_SYSTEM` and points you to the e-Way Bill system
  (`api.ewaybillgst.gov.in`).
- Sandbox vanity GSTINs for tests: `33GSPTN1882G1Z3`, `27GSPMH1881G1ZH`,
  `27GSPMH1882G1ZG`, `33GSPTN3381G1Z5`, `33GSPTN3382G1Z4`, `27GSPMH3381G1ZI`.

## 3. Email notifications (REQ-CA-013)

MyCA posts JSON `{ from, to, subject, text }` to a relay **you** control, so any provider
works behind one small function. **A ready-made relay ships in this repo** at
[`email-relay/`](../email-relay/README.md) — a Cloudflare Worker that uses Cloudflare's
native Email Service (`send_email` binding), so there is **no third-party API key**:

```bash
cd email-relay
npx wrangler email sending enable yourfirm.in    # onboard the sending domain (SPF/DKIM)
npx wrangler secret put RELAY_TOKEN              # long random shared secret
# set vars.ALLOWED_FROM_DOMAIN in wrangler.jsonc, then:
npm install && npm run deploy
```

Then in `platform/.env`:

```
MYCA_EMAIL_FROM=compliance@yourfirm.in
MYCA_EMAIL_RELAY_URL=https://myca-email-relay.<subdomain>.workers.dev
MYCA_EMAIL_RELAY_TOKEN=<the RELAY_TOKEN>
```

Prefer another provider (SES, Postmark, Resend)? Keep the same contract and point
`MYCA_EMAIL_RELAY_URL` at your own function. Without a relay, **Share** still opens a
`mailto:` link in the CA's own mail client.

## 4. WhatsApp (REQ-CA-013)

```
MYCA_WHATSAPP_PHONE_NUMBER_ID=<Meta phone number id>
MYCA_WHATSAPP_ACCESS_TOKEN=<permanent token>
```

Needs a Meta Business account. Outside the 24-hour service window, delivery requires an
**approved message template** — MyCA currently sends plain text, so expect the send to
succeed only for users who have messaged you recently.

Without credentials, **Share** still opens a `wa.me` link.

## 5. TallyPrime (local)

1. In TallyPrime enable the XML/ODBC interface (default port **9000**).
2. Set `MYCA_TALLY_HOST=127.0.0.1` and `MYCA_TALLY_PORT=9000`.
3. Verify: `provider_doctor` → `tally` shows `reachable`.

CSV/XML import works with or without a live Tally connection.
4. Write-back (2026-10-20): "push September to Tally" sends the month's ledger masters and
   vouchers to that address after a preview; the reply's created/altered/error counts are
   kept per month and a second send is refused until you say "again". Loopback only; no
   live switch or approval, because Tally is on this machine, but every send is audited.

## 6. NVIDIA NIM (optional AI)

`NVIDIA_NIM_API_KEY=<key from build.nvidia.com>`. An LLM may only choose tools — it never
produces a financial figure.

## 6a. United States: Plaid, TaxJar, Gusto, Track1099 (2026-10-21)

All four are saved from the **Sandbox keys** page (section 3, "Connectors") or with
`set_channel_connector`, encrypted in the local vault. Pulls run behind the read-only
switch `MYCA_ENABLE_CHANNEL_PULLS=1`; nothing here needs the government live switch.

| Provider | What to get | What MyCA does |
|---|---|---|
| Plaid | `client_id` and the Sandbox secret from dashboard.plaid.com → Developers → Keys | `plaid_link_sandbox` links the Plaid test bank without Plaid Link (sandbox only); `fetch_channel_report {channel: plaid, kind: bank}` syncs transactions by cursor into a bank statement file that `import_bank` posts. Production needs Plaid Link in the app to obtain the public token. |
| TaxJar | the API token from app.taxjar.com → Account → API Access (a Sandbox token on Professional and above, else the live token with `environment: production`) | `taxjar_rate {zip, city, state}` records the combined rate as the jurisdiction's sales tax rate from today |
| Gusto | an application at dev.gusto.com with these redirect URIs registered: `http://127.0.0.1:4780/api/oauth/gusto/callback` and `http://localhost:4780/api/oauth/gusto/callback` (the hosted service will use `https://<api host>/v1/oauth/gusto/callback`); its Client ID and Client Secret, environment `demo` | `gusto_connect_url` opens the OAuth consent; the browser returns to MyCA, which exchanges the code (`gusto_callback`, state checked once) and keeps the tokens; `fetch_channel_report {channel: gusto, kind: payroll}` stores processed payroll summaries as a CSV. Nothing is posted from them yet. |
| Track1099 | an account at track1099.com; the API key if you have one, `testMode: true` | the key is kept for the day the API routes are confirmed from Track1099's documentation; until then the 1099-NEC figures leave MyCA as a file |

## 7. Verify everything

```
provider_doctor
```

Reports, per provider: configured? which environment? reachable? and the **exact missing
pieces**. Then:

- **Test a notification:** `test_notification` (channel + recipient) — gated by the live switch.
- **Test e-invoice:** `nic auth` then `nic session` before touching live IRN calls; IRN
  calls are mock-first by default. `nic health` needs no credentials at all.

## 8. Go-live checklist

- [ ] `MYCA_ENABLE_LIVE_CALLS=1` set deliberately.
- [ ] `provider_doctor` shows the provider you intend to use as `reachable`.
- [ ] Sandbox is on the **live** host with **live** keys (not generic/test).
- [ ] NIC public key loaded and `nic auth` succeeds.
- [ ] An approval exists for any gated operation (`approval_list`).
- [ ] Books backed up (Firm tab → **Backup books**) before the first live filing.
