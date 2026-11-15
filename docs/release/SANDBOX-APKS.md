# Sandbox: every country app on Google Cloud, nothing filed for real

Production (`myca-api` in `myca-prod-in`) runs `main`, hosts India only and signs in with Google
only. The sandbox is a separate Cloud Run service, **`myca-sandbox`** (same project,
`asia-south1`). It runs `develop` and serves all five apps behind one address. Production is not
touched: the sandbox has its own service account, image registry, secrets and database (Postgres
inside the container), and GitHub deploys it through its own identity pool that only admits
`develop`. It cannot reach production.

`https://myca-sandbox-tvfsqs2oha-el.a.run.app`

| App (test build) | Package | Talks to | Government / payments |
|---|---|---|---|
| MyCA Test (India) | `com.mldynamic.myca.test` | `/in` | GST portal, GSTR-1/3B, e-invoice, e-way bill, Quicko lookups simulated (`MOCK-` references) |
| MyCA US Test | `com.mldynamic.myca.us.test` | `/us` | Stripe test checkout and the e-file partner faked; you play them on the console |
| MyCA UK Test | `com.mldynamic.myca.uk.test` | `/uk` | HMRC MTD simulated |
| MyCA UAE Test | `com.mldynamic.myca.uae.test` | `/uae` | FTA VAT and PINT AE simulated |
| MyCA Malaysia Test | `com.mldynamic.myca.my.test` | `/my` | LHDN MyInvois simulated |

Test builds install beside the store apps and show a test-server banner.

## Sign in

- **Google**: Continue with Google. The server accepts the MyCA web client
  `645603112925-c1083jmk9hsiact66t2hott02ff75c3r.apps.googleusercontent.com`. Each test package needs
  an Android OAuth client with the sandbox signing key's SHA-1 (step 2 below), or Google answers
  "developer error".
- **Test numbers** (always shown on a test server, no SMS, code `246810`, five codes an hour each):
  India and UK `9000000001` to `9000000003`; US `+1 202 555 0143` to `0145`; Malaysia `123000001`,
  `123000002`; UAE `501000001`, `501000002`.

AI chat uses the Anthropic API key in Secret Manager (`myca-sandbox-model-key`). The server only
calls the model host and Google's sign-in keys; every other outside call is faked or refused.

## 1. Set it up once (Cloud Shell, about 10 minutes)

Open https://shell.cloud.google.com, then:

```bash
git clone -b develop https://github.com/Vidyuthlabstechnologies/myca.git && cd myca
bash scripts/sandbox-cloud-setup.sh
```

It asks once for the Anthropic API key (input hidden; Enter skips AI chat), then turns on the APIs
and creates the registry, the two service accounts, the secrets, the service and the GitHub
deploy pool. It builds the image with Cloud Build (falling back to Cloud Shell, or `BUILD=local`), deploys, and prints the address and the console
link (`/?k=...`). Run it again any time; it only adds what is missing. To change the AI key, run it
with `MYCA_MODEL_API_KEY=... bash scripts/sandbox-cloud-setup.sh`.

From then on every push to `develop` that touches the server redeploys the sandbox and walks every
app through it (**Deploy the sandbox (develop)** in Actions).

## 2. Turn on Google sign-in for the test apps (Google Cloud console, 5 clicks each)

In the project that owns the MyCA web client: **Google Auth Platform > Clients > Create client >
Android**. Make one client per package from the table above, each with SHA-1
`16:BE:0D:21:6B:43:0B:2A:8B:A9:E5:93:5F:35:4E:BD:6C:6D:41:1B`. That SHA-1 belongs to the sandbox
signing key (`myca-sandbox.jks`, kept in the project files under `myca/apk/sandbox-signing`). Every
sandbox APK is signed with it, so the clients stay valid across rebuilds. It is not the Play upload
key.

## 3. Install and use

Install the APKs from the project files (`myca/apk`). Open the console link once in the phone's
browser; it remembers the key for 30 days.

- **India:** create a business with a GSTIN such as `29AAACM1234F1ZU` and raise invoices. Then go
  to Taxes: connect the GST portal (any username, any six-digit OTP), save GSTR-1 and GSTR-3B,
  approve the GST review and file. E-invoice needs the business address and PIN first, as in
  production.
- **US:** set up the household, taxpayer and W-2s, review, and tap to file. Pay the fee on the
  console checkout page (**Pay with test card 4242**). Tap to file again, then press **submitted**
  and **accepted** on the console. The in-app partner link does not open.
- **UK, UAE, Malaysia:** create a business and use the country screens. Every government answer is
  simulated and tagged.

Check every app from any computer: `node scripts/sandbox-server-check.mjs <address> <console key>`
(54 steps; `--no-console` instead of the key skips the US partner steps).

## Rebuilding the APKs

Actions > **Build Android app** with backend `test` and `sandbox_url` set to the address. That run
is signed with the debug key, so add its SHA-1 as well, or build locally with the sandbox key in
`mobile/android/key.properties`:

```bash
flutter build apk --release --flavor india -P mycaTest=true \
  --dart-define=MYCA_CLOUD_URL=https://myca-sandbox-tvfsqs2oha-el.a.run.app/in \
  --dart-define=MYCA_GOOGLE_SERVER_CLIENT_ID=645603112925-c1083jmk9hsiact66t2hott02ff75c3r.apps.googleusercontent.com
```

## Running it on a PC instead

`scripts/sandbox-server.ps1` (Windows: Git, Node 22, Docker Desktop, ngrok) or
`node scripts/sandbox-server.mjs --public-url=https://<tunnel>` with `MYCA_DATABASE_URL` and a
32+ character `MYCA_SANDBOX_SEED`. APKs then need rebuilding with that address.

## Limits

- Sandbox data lives in the container's database. It survives redeploys only until the instance is
  replaced, and Cloud Run can replace it at any time. Treat it as throwaway test data.
- The US sandbox runs in `asia-south1` with test data only. Real US data still goes only to the
  US stack.
- Real Google Play billing, Sign in with Apple, push, WhatsApp and email are not in the sandbox.
- One warm instance (1 vCPU, 1 GiB, CPU only billed fully while answering) should cost roughly
  USD 15 to 30 a month from the credit. `gcloud run services update myca-sandbox --min-instances 0
  --region asia-south1` lowers that, but wipes the data whenever the instance sleeps.
