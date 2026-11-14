# MyCA US sandbox: run the whole US app locally with no outside accounts

One command starts the hosted API with every outside service faked, so MyCA US can be used
end to end on a laptop, an emulator or a test phone: sign in, household, taxpayer profile (the
SSN is sealed by `platform/src/us-identity.mjs`), W-2 and other forms, the interview, review,
the filing fee by card (Stripe in test mode), MyCA Plus (by card or Google Play), e-filing through
the embedded partner (Column Tax shape, `platform/src/us-filing-partner.mjs`) or through MyCA's
own MeF route in simulator mode (`platform/src/us-mef-sim.mjs`).

Nothing leaves the machine. Stripe, Google Play and the partner are answered in-process; any other
outside request is refused and shown on the console. The sandbox refuses to start with
`MYCA_ENABLE_LIVE_CALLS`, a live Stripe key (`sk_live_`), a real partner key, or on a production
host (`K_SERVICE`, `MYCA_PRODUCTION`, `MYCA_ENVIRONMENT=production`).

Code: `scripts/us-sandbox.mjs` (the command) and `cloud/sandbox/us-sandbox.mjs` (the fakes and the
console). `cloud/sandbox/` is not copied into the API image.

## 1. Once: a database

Any Postgres 13 or newer. With the one the cloud tests use:

```bash
psql -h 127.0.0.1 -p 5433 -U myca -d postgres -c "create database myca_us_sandbox"
cd cloud && npm ci && cd ..
```

## 2. Check that everything works (about 2 seconds)

```bash
MYCA_DATABASE_URL=postgres://myca@127.0.0.1:5433/myca_us_sandbox node scripts/us-sandbox.mjs --check
MYCA_DATABASE_URL=postgres://myca@127.0.0.1:5433/myca_us_sandbox node scripts/us-sandbox.mjs --check --route=mef --plus=play
```

Each run walks the whole path through the API and prints one line per step: sign in with a US
number, accept the privacy notice, create a household, set the taxpayer with an SSN, add a W-2,
review (no SSN in the answer), filing refused before payment (`US_RETURN_UNPAID`), Stripe test
checkout at the $99 launch price, pay with the test card (a signed `checkout.session.completed`
webhook), return shown as paid and marked as a test purchase, file, the partner session opened
without the SSN, signed partner webhooks for submitted and accepted (or, on `--route=mef`, Form
8879 signed and the simulator's acknowledgement), the 1040 hub showing accepted, and MyCA Plus
switched on. It exits 0 when every step passes. CI runs the same check in
`cloud/test/us-sandbox-run.test.mjs`.

## 3. Run it for the app

```bash
MYCA_DATABASE_URL=postgres://myca@127.0.0.1:5433/myca_us_sandbox node scripts/us-sandbox.mjs
```

| Option | Default | Meaning |
|---|---|---|
| `--route=partner` | yes | E-file through the fake embedded partner; you play the partner on the console. |
| `--route=mef` | | MyCA's own MeF route. The return must be signed (Form 8879) first; the simulator answers at once. |
| `--plus=card` | yes | MyCA Plus is bought by card (Stripe test checkout). |
| `--plus=play` | | MyCA Plus is bought in Google Play. Any purchase token the app sends is read as an active test subscription. |
| `--port=8080`, `--console-port=8090`, `--host=127.0.0.1` | | Where the API and the console listen. |
| `--quiet` | | No request log. |

It prints the API address and the console address:

- API: `http://127.0.0.1:8080`
- Console: `http://127.0.0.1:8090`. It shows the sign-in codes (no SMS is sent), every Stripe test
  checkout with Pay and Refund buttons, every partner session with Started, Submitted, Accepted and
  Rejected buttons (each sends a webhook signed with the sandbox secret), and an event log.

Each run makes new Stripe, partner and webhook secrets, so nothing from one run works against
another. The data stays in the database between runs; drop and recreate it to start clean.

### The app on an emulator or a phone

```bash
adb reverse tcp:8080 tcp:8080
adb reverse tcp:8090 tcp:8090
cd mobile
flutter run --flavor us --dart-define=MYCA_CLOUD_URL=http://127.0.0.1:8080
```

`adb reverse` lets the device reach both ports on `127.0.0.1`, so the Stripe checkout link (it
points at the console) opens in the device browser too. Debug builds allow plain http.

Sign in with a US number in full E.164 form, for example `+1 202 555 0143`, and read the code from
the console. (A bare ten-digit number is still read as an Indian one.) Google sign-in needs real
Google client ids and is off in the sandbox, so the app shows the phone sign-in.

### A filing session, step by step (partner route)

1. In the app: create the household, add the taxpayer (and spouse for married filing jointly), add
   a W-2, finish the interview and the review.
2. Tap to file: the app asks for the fee ($99 launch price until the end of 15 April 2027 New York
   time, then $129). The checkout opens on the console's test page; tap **Pay with test card 4242**.
   The page says the payment is done; go back to the app, which shows the return as paid.
3. Tap to file again: the app gets a partner link on `https://partner.sandbox.myca.test`, which does
   not open (there is no real partner). Play the partner on the console instead:
   **submitted**, then **accepted** or **rejected** (IND-031-04, prior-year AGI). The 1040 hub follows.
4. After a rejection, tap to file again in the app: the same partner session reopens, and the next
   **submitted** and **accepted** are a second attempt.
5. **Refund** on the console sends `charge.refunded`; the return is unpaid again.

### MeF simulator triggers (`--route=mef`)

The simulator rejects a return on purpose when it carries one of these
(`SANDBOX_TRIGGERS` in `platform/src/us-mef-sim.mjs`):

| Put this in the return | IRS reject code |
|---|---|
| Prior-year AGI `99999` when signing | IND-031-04 (or IND-032-04 for the spouse) |
| An SSN ending `0909` and no IP PIN | IND-181-01 |
| A last name starting `ZZMISMATCH` | R0000-500-01 |
| A dependent with the first name `DUPLICATE` | IND-507-01 |

## What the sandbox does not cover

- The partner's real API. Its request and webhook shapes are guessed until the contract is signed
  (`docs/integrations/US-EFILE-PARTNER.md`); the fake follows the guessed shape.
- Real Stripe test mode. To try it, run the API itself (`npm run dev` in `cloud/`) with an
  `sk_test_` key, `MYCA_STRIPE_WEBHOOK_SECRET` from `stripe listen --forward-to
  127.0.0.1:8080/v1/billing/stripe/webhook`, and `MYCA_US_CHECKOUT_RETURN_URL`.
- Real Google Play licence testing, which needs the Play Console listing for
  `com.mldynamic.myca.us`.

## Tests behind it

```bash
cd cloud
MYCA_TEST_DATABASE_URL=postgres://myca@127.0.0.1:5433/postgres node --test test/us-*.test.mjs
```

`test/us-sandbox-edge.test.mjs` covers the edge cases: forged, stale and replayed Stripe webhooks,
async and unpaid sessions, a payment for another household or year, paying twice, refunds and
disputes, the launch-price cut-over to the millisecond, filing before paying and twice, partner
webhook replays, out-of-order and unknown events, bad and short signing secrets, a rejected return
filed again, the partner down or timing out, SSNs kept out of logs, answers, audit events and the
partner payload (and sent only with `MYCA_US_FILER_SEND_TINS`), married filing jointly, two tax
years, US data refused on the India deployment, and account deletion removing US data.
