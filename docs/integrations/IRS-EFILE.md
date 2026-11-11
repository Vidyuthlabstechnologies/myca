# IRS e-file (MeF) for Form 1040

MyCA files US individual returns through the IRS Modernized e-File (MeF) system as an
Online Provider. This page says what is built, what each mode does, and what the company
must obtain before the first real return goes to the IRS.

## Modules

| Module | What it does |
|---|---|
| `platform/src/us-mef-map.mjs` | Form 1040, Schedule 1, 2, 3, C, SE and W-2 lines to MeF element names. One table; change names here only. |
| `platform/src/us-mef-xml.mjs` | Builds the return XML and the submission manifest from the computed 1040 (`computedForm1040ForFiling` in `us-1040.mjs`). Refuses with a list of problems (code, message, fix, step) instead of dropping a line it cannot map. |
| `platform/src/us-mef-zip.mjs` | The transmission zip (one zip per submission holding `manifest/manifest.xml` and `xml/submission.xml`). No dependency; `node:zlib` crc32. |
| `platform/src/us-mef-sim.mjs` | Local acknowledgement simulator used in sandbox mode. |
| `platform/src/us-mef-settings.mjs` | Reads the IRS credentials from the environment and says which are missing. |
| `platform/src/us-mef-client.mjs` | The A2A transport: WS-Security signed SOAP (RSA-SHA256, exclusive c14n written directly), MTOM attachment, Login, SendSubmissions, GetAcks, Logout. Only the action gate calls it. |
| `platform/src/us-efile.mjs` | The tools: `sign_us_return`, `file_us_return`, `us_efile_status`, `fetch_us_efile_acks`, `us_efile_setup`. |

## Modes

- **Sandbox, simulator** (default; no IRS credentials). The return is built exactly as for
  the IRS, then checked by `us-mef-sim.mjs`. Nothing leaves the machine. Status reads
  `mode: 'sandbox'`. Test triggers: prior-year AGI `99999` gives IND-031-04 (or IND-032-04 for
  the spouse); a primary SSN ending `0909` without an IP PIN gives IND-181-01; a last name
  starting `Zzmismatch` gives R0000-500-01; a dependent named `Duplicate` gives IND-507-01.
- **Sandbox, IRS ATS** (credentials set and `MYCA_PROVIDER_ENV=test`). Goes through the action
  gate (`irs_mef_send`, `irs_mef_acks`, family `irs`) to the IRS Assurance Testing System
  with `TestCd T`. Still `mode: 'sandbox'`.
- **Live** (credentials set and `MYCA_PROVIDER_ENV=live`). Production MeF. The gate requires a
  matching approval (`caApprovalId`) for `irs_mef_send`, as for every other filing.

## Settings

| Variable | What |
|---|---|
| `MYCA_IRS_ETIN` | Transmitter ETIN (5 digits), from the IRS e-file application. |
| `MYCA_IRS_EFIN` | EFIN (6 digits). |
| `MYCA_IRS_SOFTWARE_ID` | Software ID (8 digits) issued after ATS for the tax year. |
| `MYCA_IRS_APP_SYS_ID` | A2A application system ID registered in e-Services. |
| `MYCA_IRS_CERT_PATH`, `MYCA_IRS_KEY_PATH` | PEM certificate and key of the IRS-approved strong-authentication certificate. |
| `MYCA_IRS_MEF_URL` | Optional host override. Defaults to the ATS host in test, production in live. |

## Data handling

- Signature PINs, prior-year AGI/PIN, IP PINs and bank details are sealed with
  `credential-vault.mjs`, also while a phone proposal waits for confirmation.
- The return XML (which holds SSNs) is never stored; only its sha256, the submission id and
  the acknowledgement are kept in `usEfile`.
- A signature is bound to the return's digest; a changed return must be signed again.

## Not verified yet

The official MeF schemas and WSDLs are only given to accepted providers through the IRS
Secure Object Repository, so the element names in `us-mef-map.mjs`, the header layout and
the SOAP calls are written from the public form instructions and MeF publications and have
never been validated against the schema or run against ATS. GetAcks returns its
acknowledgements in a zip attachment in MeF; the parser handles the XML, and the zip read
needs adding during communication testing. State returns are not built.
