# Security and privacy

| | |
|---|---|
| Version | 1.0, 6 October 2026 |
| Status | Engineering description. It is not a legal assessment; a DPDP Act assessment has not been commissioned. |

## 1. What is being protected

| Asset | Why it matters |
|---|---|
| A business's books, invoices and returns | Commercially sensitive; errors have tax consequences |
| Customer and supplier names, GSTINs, phone numbers | Personal data of third parties who never agreed to anything |
| Employee salary data (once payroll exists) | Sensitive personal data |
| The ability to file a return or send a message in the owner's name | An irreversible act with legal effect |
| Provider credentials, the token signing secret | Keys to everything above |

## 2. Who is trusted with what

| Actor | Trusted to | Not trusted to |
|---|---|---|
| Owner | Everything in their business | See any other business |
| Staff | Record entries | Manage members; approve external actions |
| Accountant | Read the books, record entries, decide exceptions | Manage members. Approving a filing is undecided (PRD Q2). |
| The app | Display and collect | Compute any figure; hold books at rest |
| The chat layer or a language model | Choose a named tool and fill its arguments | Post, file, send, or produce a figure |
| Engineering staff of the company | Operate the service | Read a business's books without a logged, justified access. The control for this is not built. |

## 3. Controls that exist

### Identity and sessions

- Google Sign-In (the pilot's method). The app gets an ID token from Google for the
  API's web client id. The API verifies it itself with `node:crypto`:
  - the RS256 signature, against Google's published keys (cached for their max-age and
    refetched for an unknown key id);
  - the issuer, the audience (`MYCA_GOOGLE_CLIENT_IDS`) and the expiry.
  The user is found or created by Google's account id, never by email. An email is
  stored only when Google marks it verified.
- The books column is sealed per business with AES-256-GCM under a key derived from the
  service's `MYCA_BOOKS_KEY` and the business id (2026-10-18). The service refuses to start on
  Cloud Run without the key; a row sealed for one business does not open under another; a
  row from before the key opens and is sealed on its next write. Nothing in the column is
  readable from a database dump alone.
- Every request to a business by a signed-in member is written to an access log the owner
  can read ("who looked at my books", 365 days); the database itself logs every read and
  write by any role, including the operator, to Cloud Logging for 180 days (pgaudit).
- A deleted business is purged thirty days after the request, books, documents and audit
  trail included (`docs/operations/RETENTION.md`).
- Owner-only settings are enforced in the engine, not only in the app: the invoice design
  (including the bank account printed on invoices) and invoice numbering refuse any actor
  who is not the owner, and both are previewed before they change (2026-10-16). Salary TDS
  rows (form 24Q) are shown to the owner only, like payroll.
- Phone and one-time code. Codes are stored as salted hashes, expire in five minutes,
  allow five tries, and are limited to five an hour per number. Off until an SMS sender
  exists; `GET /v1/auth/methods` tells the app which methods are on.
- A Google-only user has no phone number, so invitations (which are addressed to a
  number) do not reach them yet.
- Access tokens are signed, last 15 minutes, and are checked against the device and
  user on every request, so revoking a device takes effect at once.
- Refresh tokens are stored as hashes, rotate on use, and reuse of a spent token
  revokes the device.
- On the phone the refresh token is in the Android keystore, and the app can require
  the fingerprint or screen lock.
- Desktop: a PIN per firm user with scrypt, a five-strike lockout, and PIN records in
  an encrypted vault outside the state file and outside backups.

### Tenancy

- The business comes from the URL and membership is checked on every request. A
  non-member gets 404, the same as for a business that does not exist.
- One business's books are one row; a request locks and reads only that row.
- The acting user is supplied by the server from the verified session. Identity fields
  in a request body are overwritten (`withTrustedActor`).
- Provider sessions are keyed by environment, client, user and GSTIN, so one taxpayer's
  session is never reused for another.
- The WhatsApp channel applies the same shared-view rule as the API: an accountant whose
  owner shares the books daily or by hand reads the shared copy and cannot post (2026-10-16).
- One address may ask for at most thirty sign-in codes an hour across all numbers, beside
  the five per number, so one caller cannot lock many people out or run up the SMS bill.
- Inbound documents and mail count against the business's storage cap like uploads; a POS
  sale id is posted once even under concurrent retries (an advisory lock around the check
  and the insert).
- The nightly job and connector pulls skip a business whose owner asked for deletion.
- Signing keys for Google and OIDC are refetched at most once a minute, so a flood of
  unknown key ids cannot make the service hammer the issuer.

### What the network can reach

- Remote callers can propose twenty-seven write tools and the importers, and query a fixed list
  of read tools. The rest of the tool catalogue is not reachable.
- Every tool has a strict schema with no additional properties.
- Imports refer to an uploaded document by hash; inline content is refused.
- Request bodies are capped (uploads at 8 MB).

### Actions that leave the system

- The action gate, described in the [architecture](ARCHITECTURE.md#7-the-action-gate).
- The live switch is off by default, and the hosted server refuses to start with it on.
- A second, narrower switch (`MYCA_ENABLE_CHANNEL_PULLS`, 2026-10-16) opens only read-only pulls on the channel family (marketplace and payment reports); every government, model and write action still needs the live switch. The hosted API may run with the pull switch on; each business's channel credentials are sealed per business with the service's connector key.
- An approval is bound to a hash of the exact payload; changing anything voids it.
- OTP, EVC and DSC steps are performed by the taxpayer. The product does not store
  them.

### Integrity and audit

- The ledger is append-only with a checksum chain that is verified.
- Every state change records an audit event with the actor and the state hash before
  and after. In the hosted service the audit table refuses update, delete and truncate.
- Documents are stored by sha256 and verified on every read.

### Secrets

- No secret values in code, logs, state, audit events or tool results. Values under
  key names that look secret (`secret-keys.mjs`) are redacted before anything is
  recorded.
- Desktop provider credentials are encrypted at rest.
- `.env` files are not committed.

### Privacy notice and consent

- The notice lives in `cloud/src/consent.mjs` with a version id, and is served at
  `GET /v1/privacy-notice` without sign-in, so the app, the website and the Play listing
  can show the same text.
- After the sign-in code, the app shows the notice. "I agree" records the user, the
  notice version, the device and the time in `consents`. "Not now" signs out.
- The server enforces it: until the current version is accepted, every route except
  reading your own profile, accepting, deleting your account, crash reports and the
  state list answers `403 CONSENT_REQUIRED`. A new notice version asks everyone again,
  on the next request or the next time the app opens.
- The current text is a draft marked as one on screen. It must not reach real users
  until counsel approves it and the placeholders are filled.

### Salaries

- Employee records and salaries are visible to the owner only. Staff and accountants are
  refused in the engine (`SALARIES_PRIVATE`), so the hosted API, chat and the app all
  refuse them too; the books snapshot sent to the phone carries no employees.
- No employee bank account is stored.

### What an accountant sees

- The owner decides whether an accountant reads the live books or a copy as of the last
  sync point. A shared view is read-only, and every read is audited.
- The copy is of the whole books, stored in the same database and region, and replaced
  at each sync point; it is not kept as a history.

### Crash reports

- Built without a crash-reporting SDK, so no third party receives anything and no
  dependency was added. The app catches Flutter and async errors in hosted builds only.
- What a report holds: the kind (`flutter`, `async`, `server`), the error type, the
  message, the stack, the app version and a count. Nothing about the user, device or
  business.
- Before a report is queued on the phone, and again on the server, the message and the
  stack are scrubbed:
  - quoted text, GSTINs, PANs, phone numbers, email addresses, rupee amounts, numbers of
    four or more digits, ids, tokens and URL query strings are replaced with markers;
  - file names and line numbers are kept.
- The message is cut to 300 characters and the stack to 40 frames.
- Limits:
  - the queue on the phone holds at most 20 reports, with repeats counted;
  - reports are sent only after sign-in, at most ten per request in a 64 KB body.
- The same crash in the same version is one row with a count. Rows are deleted 90 days
  after the crash was last seen.
- Server 500s are recorded the same way, with the Cloud Run revision as the version.
- The owner can switch it off in the business sheet, which also drops anything queued.
  It is on by default, so the privacy notice and the Play data-safety form must say
  "crash logs, not linked to the user".
- Read them with `npm run crashes` in `cloud/` against the production database.
- Scrubbing is pattern-based. A name that is not quoted in an error message would get
  through, which is why only unhandled errors are reported, not the app's own error
  messages.

### Supply chain

- The engine has no runtime dependencies. The hosted API has one (`pg`). The app has
  nine packages (Google Sign-In and share_plus were added on 2026-10-07). `vendor/` is
  never imported.

## 4. Gaps, stated plainly

| Gap | Risk | Needed |
|---|---|---|
| Not deployed, so no TLS, network policy, backups or monitoring exist | None yet; all of it before the first real user | Deployment design in the cloud backend spec |
| Books-column encryption is new (2026-10-18) and the service key lives in Secret Manager with the database password | A compromise of both the database and Secret Manager reads every business; rotating the key means re-sealing every row | Rotation procedure and a KMS-held key before the first hundred businesses |
| Operator access to the database is logged (pgaudit, 180 days) but not gated | An operator can still read rows; what they read is on record | A break-glass role with a ticket reference before launch |
| No rate limit beyond sign-in codes | Abuse of the API by a signed-in device | Per-device and per-business limits at the edge |
| Uploads, inbound documents and mail are capped at 200 MB per business | Storage per business is bounded; growth is from businesses, not abuse | Watch the bucket size |
| Phone numbers are stored in clear in `users` | Exposure in a breach | Acceptable as the login identifier; revisit with the assessment |
| Reads write an audit event into the books row | Not a confidentiality risk; a contention and cost issue | Separate read path |
| Retention policy written and enforced (`docs/operations/RETENTION.md`); the periods await counsel | A period counsel changes means a code change | Counsel's sign-off |
| The privacy notice is a draft: retention periods and the Grievance Officer are placeholders | Showing it to real users before counsel approves it | Legal review, then a new version id |
| Staff role has the same permissions as accountant | Over-broad access for a billing clerk | Role review before pilot |
| Desktop default admin PIN | Known credential on first run | Force a change on first sign-in |
| The desktop page carries the local API token | Another local user on a shared Windows machine who can reach 127.0.0.1 could call the local API | Hand the token over the Electron preload bridge instead of the page |
| The app has never run on a device | Keystore and biometric paths unverified | Device testing |
| No penetration test; dependency scanning runs on every push (npm audit, dependency review on pull requests, Dependabot weekly) and CodeQL on the JavaScript | Unknown unknowns a scanner does not see | A penetration test by an outside firm before launch |

## 5. Language models

Not in use today. When one is added (ADR-0004):

- It receives the message and the tool catalogue, not the books.
- It returns a tool name and arguments, which are validated against the schema and
  shown to the owner as a preview.
- For document reading it receives the document image. Whether that may leave India,
  and which provider's terms are acceptable for financial documents, is PRD Q3 and
  belongs to the DPDP assessment.
- Text in a document or a message is data. It is never treated as an instruction to
  the system.

## 6. Play Store

The listing will need a privacy policy URL, the data safety form (phone number,
financial information, files, crash logs not linked to the user; none shared with third
parties today), account deletion
reachable from inside and outside the app, and a justification for each permission
(biometric, notifications, and the system file picker for bills). Drafted 2026-10-14 in
`docs/release/PLAY-LISTING.md`, `docs/release/PRIVACY-POLICY.md` (served as
`deploy/public/privacy.html`) and `docs/architecture/DPDP-ASSESSMENT.md`; the owner
names the entity, the processors and the grievance officer before publishing.

## 7. Reporting a vulnerability

There is no public process yet. Until there is, report to the repository owner
privately; do not open a public issue.
