# MyCA email relay (Cloudflare Worker)

MyCA sends notifications by POSTing JSON to a relay you control:

```
POST {from, to, subject, text, html?}
Authorization: Bearer <MYCA_EMAIL_RELAY_TOKEN>
```

This Worker turns that into a real email using **Cloudflare Email Service**
(`send_email` binding) — no third-party API key, no SMTP.

## One-time setup

1. **Onboard your sending domain** (must be a domain on your Cloudflare account):

   ```bash
   npx wrangler email sending enable yourfirm.in
   ```

   This adds the DKIM/SPF records so mail is deliverable.

2. Set the allowed sender domain and a shared secret:

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
- The Worker rejects any `from` outside `ALLOWED_FROM_DOMAIN`, caps the payload at 1 MB,
  and requires the bearer token — it is not an open relay.
- Errors from Cloudflare (`E_SENDER_NOT_VERIFIED`, `E_RECIPIENT_SUPPRESSED`, …) are passed
  back as `error` so the MyCA outbox shows why a send failed.
- To restrict senders further, add `allowed_sender_addresses` to the `send_email` binding.
