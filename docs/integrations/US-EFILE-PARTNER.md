# US e-file through an embedded partner (2027 season)

Owner decision, 2026-11-11: file the 2027 season (tax year 2026) through a ready-made, IRS-authorised
e-file provider under the MyCA brand, Column Tax preferred or April, while MyCA's own EFIN and ATS
testing run for 2028. Without this route, production refuses every US return with
`US_EFILE_NOT_OPEN`, because MyCA's own MeF route needs an EFIN that cannot be in place for 2027.

## How it works

1. The filer prepares the return in MyCA as today: About you, Tax documents, Questions, Review. The
   refund estimate and the review are MyCA's own engine.
2. On **Sign and e-file**, with `MYCA_US_FILER` set, the app shows *Ready to e-file* instead of the
   PIN form. The filing fee ($99 launch, $129 list) is taken first, exactly as before.
3. *Continue to e-file* proposes and confirms `file_us_return`. On the partner route the platform
   (`platform/src/us-filing-partner.mjs`) asks the partner for a filing session, prefilled with what
   MyCA knows: filing status, names, dates of birth, address, dependents, every W-2, the other forms,
   and MyCA's estimate. It returns the partner's link and the app opens it.
4. The filer adds their SSN (unless the operator allows sending it, see below), checks the return and
   signs Form 8879 on the partner's page. The partner is the ERO and transmits to the IRS.
5. The partner calls `POST /v1/us/filer/webhook`. MyCA checks the signature and records submitted,
   accepted or rejected against the return. The 1040 hub shows it like any other status, including each
   IRS reject code with its fix.

Coming back to the screen while the return is with the partner shows *Finish e-filing* with
*Continue where you left off* (same external id, a fresh link) and *I have finished. Check again*.

## Settings

| Setting | Terraform | What |
|---|---|---|
| `MYCA_US_FILER` | `us_filer` | `column-tax` or `april`. Empty keeps MyCA's own MeF route. |
| `MYCA_US_FILER_BASE_URL` | `us_filer_base_url` | HTTPS base URL of the partner API (sandbox or production). |
| `MYCA_US_FILER_SESSION_PATH` | `us_filer_session_path` | Create-session path, default `/v1/sessions`. |
| `MYCA_US_FILER_API_KEY` | `us_filer_api_key` (secret) | The partner's API key. |
| `MYCA_US_FILER_WEBHOOK_SECRET` | `us_filer_webhook_secret` (secret) | 24+ characters, shared with the partner to sign webhooks. |
| `MYCA_US_FILER_SEND_TINS` | (env) | `1` sends SSNs/ITINs in the prefill. Off by default. Turn on only when the partner contract and the IRC 7216 consent cover it. |

`MYCA_PROVIDER_ENV` decides where calls go, as for every provider: `off` keeps a dry run, `test` calls
the partner's sandbox, `live` is production. With `MYCA_US_FILER` set but the other settings missing,
the local simulator answers at once (submitted, then accepted) so the app can be tested end to end.

Production opens US filing (and sells the fee) only when the chosen route is live: for the partner,
`MYCA_PROVIDER_ENV=live` and every setting above present.

## What is still to confirm with the partner

The partner's API is shared only under contract, so the adapter reads the partner leniently and keeps
everything provider-specific in three functions in `us-filing-partner.mjs`:

- the create-session request (`createSession`: `POST {base}{path}`, bearer key, JSON `{external_id, tax_year, prefill}`),
- the session response (`readSessionResponse`: any of `url`, `user_url`, `session_url`, `link`, and an id),
- the webhook event (`normalizePartnerEvent`: an external id and a status word containing accept, reject,
  submit/transmit or start/progress, with optional `errors[]` of `{code|rule_number, message}`).

The webhook signature is HMAC-SHA256 of the raw body, hex, in the `x-myca-filer-signature` header. If the
partner signs differently, change `partnerSignatureValid` and its header name only.

The external id is `myca.<business id>.<tax year>.<random ref>`. The server, not the caller, names the
business, and an event is applied only when the random ref matches the one stored with that return, so a
correctly signed event cannot touch another person's return.
