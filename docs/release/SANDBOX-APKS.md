# Sandbox APKs: MyCA India and MyCA US on a phone, end to end, nothing filed for real

Production (`myca-prod-in`) runs `main`, which is behind `develop`, hosts India only, and signs in
with Google only. There is no staging project yet. So the sandbox APKs talk to a **sandbox server**
that runs `develop` on any computer and is reached from the phone through an ngrok address.

| | MyCA Test (India) | MyCA US Test |
|---|---|---|
| Package | `com.mldynamic.myca.test` | `com.mldynamic.myca.us.test` |
| Installs beside | the Play app `com.mldynamic.myca` | a future `com.mldynamic.myca.us` |
| Talks to | `https://<ngrok domain>/in` | `https://<ngrok domain>/us` |
| Sign in | `9000000001`, `9000000002` or `9000000003`, code `246810` | `+1 202 555 0143`, `+1 202 555 0144` or `+1 202 555 0145`, code `246810` |
| Government / partner | GST portal, GSTR-1/3B save and file, e-invoice, e-way bill, Quicko lookups: simulated (tagged mock), or the Quicko sandbox with the TEST key | Stripe test checkout and the e-file partner are faked; you play them on the console |

The code is the same for every test number and no SMS is sent. Each number may ask for five codes
an hour.

## 1. Start the sandbox server (Windows, once per session)

Needs Git, Node.js 22, ngrok signed in to your account (it owns the free static domain), and
Docker Desktop (for Postgres) or a Postgres you already run.

```powershell
irm https://raw.githubusercontent.com/Vidyuthlabstechnologies/myca/develop/scripts/sandbox-server.ps1 -OutFile $env:TEMP\sandbox-server.ps1
powershell -ExecutionPolicy Bypass -File $env:TEMP\sandbox-server.ps1
```

It clones `develop` to `%USERPROFILE%\myca-sandbox`, starts Postgres in a container
(`myca-sandbox-db`, data kept in a Docker volume), opens ngrok on the static domain in a second
window and starts the server. Stop any other program that uses the same ngrok domain first (only
one tunnel can hold it). Options: `-Domain other.ngrok-free.dev`, `-DatabaseUrl postgres://...`,
`-AllowOutside` (use the Quicko sandbox: set `MYCA_GSP_TEST_API_KEY` and `MYCA_GSP_TEST_API_SECRET`
in the same PowerShell first).

On Linux or macOS:

```bash
cd cloud && npm ci --ignore-scripts && cd ..
ngrok http --url=<domain> 8080 &
MYCA_DATABASE_URL=postgres://myca@127.0.0.1:5432/myca_sandbox node scripts/sandbox-server.mjs --public-url=https://<domain>
```

The server prints the console address, `https://<domain>/?k=<key>`. Open it once in the phone's
browser; it remembers the key for 30 days. The console shows US test checkouts and the e-file
partner buttons. Anything else on the public address except `/in/v1/...`, `/us/v1/...` and the
checkout pages answers 403.

Check that both apps work through the tunnel (36 steps):

```bash
node scripts/sandbox-server-check.mjs https://<domain> <console key>
```

## 2. Install and use

Download the two APKs, allow installs from the browser or file manager, install. Both show a
test-server banner.

**India:** sign in with a test number, accept the notice, create a business (add a GSTIN such as
`29AAACM1234F1ZU` for GST filing), raise invoices, then Taxes: connect the GST portal (any username,
any six-digit OTP), save GSTR-1 and GSTR-3B, approve the GST review, file. Every reference starts
with `MOCK-`. E-invoice needs the business address and PIN first, as in production.

**US:** sign in with a +1 test number, accept the notice (18+), set up the household, taxpayer and
W-2s, review, tap to file. The fee checkout opens in the browser on the console; tap **Pay with test
card 4242**, go back to the app. Tap to file again; then on the console press **submitted** and
**accepted** (or **rejected**) for the partner session. The 1040 hub follows. The partner link
inside the app (`partner.sandbox.myca.test`) does not open; that is expected.

## 3. Rebuild the APKs for another address

Run **Build Android app** (Actions) on `develop` with backend `test` and `sandbox_url`
`https://<domain>`. The India APK gets `/in`, the US APK `/us`. Download `myca-android` from the
run. Locally:

```bash
cd mobile
flutter build apk --release --flavor india -P mycaTest=true --dart-define=MYCA_CLOUD_URL=https://<domain>/in
flutter build apk --release --flavor us -P mycaTest=true --dart-define=MYCA_CLOUD_URL=https://<domain>/us
```

## What the sandbox does not cover

- Google sign-in and Sign in with Apple (no client ids in test builds; phone test numbers instead).
- Real Google Play billing (needs the Play listing and licence testers).
- The real e-file partner API and real Stripe test mode (see `US-SANDBOX.md`).
- The AI assistant's model calls are simulated in India (mock mode) and refused in the US sandbox.
- Push notifications, WhatsApp and email sending.
- The server lives as long as the computer and ngrok stay on.
