# MyCA UK: fraud prevention headers (`MOBILE_APP_VIA_SERVER`)

Draft 2026-11-14. The header list, value rules and the missing-data rule below were read from HMRC's
Developer Hub pages "Mobile application via server", "Getting it right" and "Missing header data" on
2026-11-14. Re-read them before each release; HMRC changes them (see its change log).

HMRC: "You are required by law to submit all header data for your connection method." Every MTD VAT
and MTD Income Tax request MyCA's server sends to HMRC carries all 18 headers below. Never send a
placeholder such as `null`, `undefined` or `unknown`. If a value genuinely cannot be collected
because of a platform or security restriction, email HMRC at
`softwaredevelopersupport@service.hmrc.gov.uk` with full details first; only after that may the
header be omitted or sent empty.

HMRC's monthly status for our application ("Correct", "Missing", "Invalid", "Errors", "Advisories")
is shown on the Developer Hub under the production application, "Fraud prevention". **HMRC says the
status must not be shared outside our organisation**, so never put it in marketing or in this
repository.

## How values travel

1. The Android app collects the device values **immediately before** each request that will lead to
   an HMRC call, and sends them to MyCA's server in a single signed request field (not as `Gov-*`
   headers from the phone, so a proxy cannot strip or alter them).
2. The server adds the network values it sees (public IP, port, the hops) and its own vendor values.
3. The server builds the headers, percent-encodes keys and values (US-ASCII only), and sends them
   to HMRC.
4. A copy is kept with the submission record (DATA-RETENTION.md) and in no other place.

## The headers

| Header | What MyCA sends | Collected by | Why HMRC wants it | Notes for the engine |
|---|---|---|---|---|
| `Gov-Client-Connection-Method` | `MOBILE_APP_VIA_SERVER` | Server (fixed) | Tells HMRC which rules apply | Same on every call |
| `Gov-Client-Device-ID` | A random UUID created by the app on first run and kept in the app's private storage. It does not expire. If the user clears app data, a new one is created | App | Recognises the same device across calls; unusual device changes can signal account takeover | Not the Android ID or advertising id. Do not derive it from hardware |
| `Gov-Client-Local-IPs` | All local IPv4 and IPv6 addresses on the phone's network interfaces at that moment, comma-separated, IPv6 percent-encoded | App (Dart `NetworkInterface.list`) | Helps HMRC spot many accounts filed from one network or device | Collect immediately before each request. Exclude loopback (**check**: HMRC's spec lists "all"; confirm with the Test API whether loopback is flagged) |
| `Gov-Client-Local-IPs-Timestamp` | UTC time the local IPs were read, `yyyy-MM-ddThh:mm:ss.sssZ` with milliseconds | App | Shows the values are fresh | Must not be changed on the server |
| `Gov-Client-Multi-Factor` | For each factor used to sign in to MyCA: `type` (`TOTP` for the authenticator app, `AUTH_CODE` for a code sent by email or SMS, `OTHER`), `timestamp` (last successful prompt, UTC) and `unique-reference` (a salted hash identifying that factor, never the secret) | Server, from the session | Shows how strongly the user proved who they are | Requires two-step sign-in; without it there is no value. Hence MyCA requires two-step before any HMRC submission. Google sign-in alone: **check with HMRC** whether Google's own two-step can be reported as `OTHER` |
| `Gov-Client-Public-IP` | The phone's public IP address as seen by MyCA's edge | Server (edge) | Location and network checks | Read from the load balancer's client address, not a header the phone could set |
| `Gov-Client-Public-IP-Timestamp` | UTC time the server received the request, with milliseconds | Server | Freshness | |
| `Gov-Client-Public-Port` | The phone's public source TCP port | Server (edge) | Distinguishes devices behind the same public IP | Cloud Run on its own does not expose the client port. Put the UK API behind an external Application Load Balancer that adds the client port as a custom request header (**check** the variable name in Google's documentation) |
| `Gov-Client-Screens` | `width`, `height`, `scaling-factor`, `colour-depth` for each screen | App (Flutter `PlatformDispatcher.views` / display) | Device fingerprint consistency | Whole pixels; colour depth commonly 24 or 32 (**check** how Flutter reports it) |
| `Gov-Client-Timezone` | Phone's offset as `UTC±hh:mm`, for example `UTC+00:00` in winter and `UTC+01:00` in British Summer Time | App | Location consistency | Offset at the moment of the request |
| `Gov-Client-User-Agent` | `os-family=Android`, `os-version`, `device-manufacturer`, `device-model` | App (`device_info_plus` or platform channel) | Identifies the operating system and device | Percent-encode each value |
| `Gov-Client-User-IDs` | `myca-uk=<MyCA user id>` plus the sign-in identifier (for example the email the user signs in with, percent-encoded) | Server | Links calls to the person using our software | HMRC asks for the identifier the user signs in with and any internal id |
| `Gov-Client-Window-Size` | `width` and `height` of the app window in pixels | App | Device consistency; split-screen use | Whole pixels |
| `Gov-Vendor-Forwarded` | For each internet hop that terminates TLS: `by=<our public IP that received it>&for=<sender's public IP>`, comma-separated; first hop `for` is the phone's public IP | Server | Shows the route from the phone to HMRC | Include the load balancer and Cloud Run hops if both terminate TLS on public addresses; no private-network hops |
| `Gov-Vendor-License-IDs` | `myca-uk=<SHA-256 hash of the user's Google Play subscription purchase token or MyCA licence id>` | Server | Links calls to a licensed copy of the software | During the free trial, hash the trial's subscription token. Use the same hashing function every time |
| `Gov-Vendor-Product-Name` | `MyCA%20UK` | Server (fixed) | The product name users see | Must match the name marketed to users |
| `Gov-Vendor-Public-IP` | The public IP of MyCA's edge the phone connects to (the load balancer address the DNS resolves to) | Server (configuration) | Identifies the vendor's servers | Use a static reserved IP so this is stable |
| `Gov-Vendor-Version` | At least two pairs: `myca-uk-android=<app version>&myca-uk-server=<server build>` | App version from the app; server version from the build | Lets HMRC match issues to software versions | |

## What MyCA does not collect

No location (GPS), contacts, advertising id, IMEI, MAC addresses, phone number from the SIM, or list
of installed apps. HMRC does not ask for them for this connection method.

## How the user is told

1. **Before connecting to HMRC**, a screen titled "What we send to HMRC" says, in plain words:
   "HMRC asks all Making Tax Digital software to send some details about your phone and connection
   with each request, to help protect you from fraud. These are: your phone's make, model and
   software version, its screen size and time zone, its internet addresses, a code that identifies
   this copy of the app, and how you signed in. We send them only to HMRC, and only when we talk to
   HMRC for you." With a link to the full list (this table in plain English, on the website).
2. **The privacy notice**, section 6, lists the same data.
3. **The Play data safety form** declares device or other IDs and IP-derived data as collected for
   fraud prevention and security, shared with HMRC.
4. The user cannot switch the headers off and still use MTD; the screen says so. They can stop
   by disconnecting HMRC.

## Testing

- Sandbox: call the Test Fraud Prevention Headers API (`/test/fraud-prevention-headers/validate`)
  from a real device build, through the real load balancer, for each release. Zero errors and zero
  warnings before release. **Check** the current endpoint path in the Developer Hub.
- Automated: a server test builds the headers from a fixed device payload and checks formats
  (timestamps with milliseconds and `Z`, percent-encoding, no empty list items, two pairs in
  `Gov-Vendor-Version`, no placeholders).
- Device matrix: at least one phone each on the oldest and newest supported Android versions, one
  tablet, one device on IPv6-only mobile data, one on Wi-Fi with IPv4 and IPv6.
- Monthly: read HMRC's status email and the Developer Hub status, log it privately, fix findings.
