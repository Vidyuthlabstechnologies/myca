# MyCA — Integrations Setup

How to turn each external integration from "wired" to "live". Nothing here requires
code changes: every step is a credential or a config line. Run
`provider_doctor` (APIs tab → **Run integration doctor**) after each step.

## 0. Ground rules

- **Outbound calls are off by default.** Nothing reaches a provider until
  `MYCA_ENABLE_LIVE_CALLS=1` is set in `platform/.env`.
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

1. On `einvoice1.gst.gov.in` register an **API user** for the GSTIN (only GSTINs notified
   for e-invoicing can authenticate). Note the client-id / client-secret.
2. Download the IRP/sandbox **public key (.cer)**.
3. In MyCA → **Govt** tab: fill environment, client-id, client-secret, API user, API
   password, GSTIN → **Save on this PC**.
4. Paste the `.cer` path (or PEM text) into **Public key** → **Load public key**.
   MyCA validates it is a real RSA key and stores it; it **refuses to send credentials
   unencrypted**.
5. Chat: `nic auth`, then `generate irn INV-0001`.

Verify: `provider_doctor` → `nic_einvoice` shows `configured` (all six pieces present).

## 3. Email notifications (REQ-CA-013)

Any provider works — MyCA posts JSON to a relay you control (AWS SES, Postmark, a
Cloudflare Worker, an Azure Function…):

```
MYCA_EMAIL_FROM=you@yourfirm.in
MYCA_EMAIL_RELAY_URL=https://your-relay.example/send
MYCA_EMAIL_RELAY_TOKEN=<optional bearer token>
```

Relay contract: `POST` JSON `{ from, to, subject, text }`; any 2xx means sent.

Without a relay, **Share** still opens a `mailto:` link in the CA's own mail client.

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

## 6. NVIDIA NIM (optional AI)

`NVIDIA_NIM_API_KEY=<key from build.nvidia.com>`. An LLM may only choose tools — it never
produces a financial figure.

## 7. Verify everything

```
provider_doctor
```

Reports, per provider: configured? which environment? reachable? and the **exact missing
pieces**. Then:

- **Test a notification:** `test_notification` (channel + recipient) — gated by the live switch.
- **Test e-invoice:** `govt_nic_auth` then `govt_nic_mock` before touching production.

## 8. Go-live checklist

- [ ] `MYCA_ENABLE_LIVE_CALLS=1` set deliberately.
- [ ] `provider_doctor` shows the provider you intend to use as `reachable`.
- [ ] Sandbox is on the **live** host with **live** keys (not generic/test).
- [ ] NIC public key loaded and `nic auth` succeeds.
- [ ] An approval exists for any gated operation (`approval_list`).
- [ ] Books backed up (Firm tab → **Backup books**) before the first live filing.
