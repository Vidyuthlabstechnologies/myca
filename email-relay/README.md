# MyCA email relay (Cloudflare Worker)

MyCA sends notifications by POSTing JSON to a relay you control:

```
POST {from, fromName?, to, subject, text, html?}
Authorization: Bearer <MYCA_EMAIL_RELAY_TOKEN>

200 {"ok": true, "id": "<message id>", "messageId": "<message id>"}
4xx/5xx {"ok": false, "error": "<CODE>"}
```

MyCA stores `id` as the outbox message's `providerId`; `messageId` carries the same value for older callers.

This Worker turns that into a real email using **Cloudflare Email Service**
(`send_email` binding) — no third-party API key, no SMTP.

## One-time setup

1. **Onboard your sending domain** (must be a domain on your Cloudflare account):

   ```bash
   npx wrangler email sending enable yourfirm.in
   ```

   This adds the DKIM/SPF records so mail is deliverable.

2. Set the allowed sender domain and a shared secret. The relay refuses every send
   (`503 FROM_DOMAIN_NOT_CONFIGURED`) until `ALLOWED_FROM_DOMAIN` is set, so a fresh
   deploy cannot send as any domain on your account:

   ```bash
   # edit wrangler.jsonc -> vars.ALLOWED_FROM_DOMAIN = "yourfirm.in"
   npx wrangler secret put RELAY_TOKEN      # paste a long random string
   ```

   Generate a token, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

3. Deploy:

   ```bash
   npm install
   npm run deploy
   ```

   Note the deployed URL, e.g. `https://myca-email-relay.<subdomain>.workers.dev`.

## Point MyCA at it

In `platform/.env`:

```
MYCA_EMAIL_FROM=compliance@yourfirm.in
MYCA_EMAIL_RELAY_URL=https://myca-email-relay.<subdomain>.workers.dev
MYCA_EMAIL_RELAY_TOKEN=<the RELAY_TOKEN you set>
```

Then in MyCA: **Firm** tab → **Send test notification** (or `test_notification` tool).
`provider_doctor` will show `email` as configured.

## Local testing

```bash
npm run dev
curl -X POST http://127.0.0.1:8787 \
  -H "authorization: Bearer <RELAY_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"from":"compliance@yourfirm.in","to":"you@example.com","subject":"MyCA test","text":"hello"}'
```

## Notes

- **Transactional only.** This is for invoice/reminder mail to clients, not bulk marketing.
- It is not an open relay:
  - The bearer token is required. Both sides are hashed with SHA-256 and compared in
    constant time.
  - `from` must be exactly `@ALLOWED_FROM_DOMAIN` (case-insensitive; subdomains are refused).
    An empty `ALLOWED_FROM_DOMAIN` refuses every send.
  - At most 10 recipients per request (`400 TOO_MANY_RECIPIENTS`); Cloudflare's own limit is 50.
  - The payload is capped at 1 MB.
  - CR and LF in `fromName` and `subject` are replaced with spaces.
- There is no rate limit in the Worker. If the token leaks, rotate it with
  `wrangler secret put RELAY_TOKEN` and update `MYCA_EMAIL_RELAY_TOKEN`.
- Errors from Cloudflare (`E_SENDER_NOT_VERIFIED`, `E_RECIPIENT_SUPPRESSED`, …) are passed
  back as `error` so the MyCA outbox shows why a send failed.
- To restrict senders further, add `allowed_sender_addresses` to the `send_email` binding.
- `platform/test/email-relay.test.mjs` runs this handler with a stub `EMAIL` binding as part
  of `npm test` in `platform/`.
