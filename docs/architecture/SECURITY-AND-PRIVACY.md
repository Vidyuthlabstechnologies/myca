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
  readable from a database dump alone. Every sealed value (books, authenticator keys,
  connector secrets, US tax numbers, the desktop vault) is opened only with its full
  16-byte check; a value whose check was cut short is refused (2026-11-13).
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
- Two-step sign-in is optional per user (2026-11-06). The app enrols an authenticator
  (TOTP, RFC 6238: SHA1, six digits, thirty seconds). The first code it shows turns the
  step on, five wrong codes during setup throw the setup away, and eight recovery codes
  are shown once. The authenticator key is sealed per user with AES-256-GCM under a key
  derived from `MYCA_BOOKS_KEY` and the user id; recovery codes are stored as keyed
  hashes and each works once. With it on, the phone code, Google or OIDC step answers a
  five-minute challenge instead of tokens; the authenticator code, or a recovery code,
  finishes it, and five wrong codes end the challenge. The server remembers the last
  thirty-second step it accepted, so a code that was used, or an older one, is refused
  and cannot be replayed. Turning it off or renewing the recovery codes needs a code.
  Deleting the account removes the key and the codes. Neither the key nor a code appears
  in a response after enrolment or in a log.
- Every user can see the devices signed in to their account (label, signed in on, last
  active; a device whose refresh token has run out is not listed) and end any other
  device, or every other device, from the app. The device stops working on its next
  request, the same as the operator's revocation.
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
- Request bodies are capped (uploads at 8 MB), and the bytes of bodies being read at one
  time are counted against one budget (a sixteenth of the memory the instance may use). A
  body larger than the budget or the route's limit is refused with 413, one that does not
  fit right now with 503 `SERVER_BUSY` and `Retry-After: 2`, before it is held in memory;
  owner-only actions refuse everyone else before their body is read; and a client that
  drops mid-upload is answered 400 and is not recorded as a crash. A dropped or refused
  database connection also answers 503 `SERVER_BUSY`, and the API process stays up.

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
| Books-column encryption is new (2026-10-18) and the service key lives in Secret Manager with the database password; the authenticator keys are sealed under the same key | A compromise of both the database and Secret Manager reads every business and every authenticator key; rotating the key means re-sealing every books row, every shared copy and every `user_totp` row, which `cloud/src/reseal.mjs` does in one transaction (`DEPLOYMENT.md`, "Change the books key", 2026-11-13) | A KMS-held key before the first hundred businesses |
| Operator access to the database is logged (pgaudit, 180 days) but not gated | An operator can still read rows; what they read is on record | A break-glass role with a ticket reference before launch |
| No rate limit beyond sign-in codes and authenticator attempts | Abuse of the API by a signed-in device; the user can now see every signed-in device and end it from the app, which bounds the damage but does not stop the abuse | Per-device and per-business limits at the edge |
| Second-step guesses at sign-in are limited for each person: five on a challenge, and after ten wrong codes in a row every challenge for that person is refused for 15 minutes (a right code clears the count; it is kept apart from the count for turning two-step off). The Google and OpenID Connect first steps have no throttle of their own beyond 60 sign-in calls from one address in ten minutes | Someone who already controls a user's Google or firm account gets at most 40 guesses an hour at a code that is right three times in a million, and can keep the owner from signing in on a new device for 15 minutes at a time; a device that is already signed in is not affected | A rate limit on `POST /v1/auth/google` and `/v1/auth/oidc` at the edge, and a longer wait after repeated locks |
| Two-step sign-in is optional, ending another device asks for no code beyond the phone's own screen lock, and turning two-step off or renewing recovery codes allows five wrong codes in a row and then refuses every code for 15 minutes (a right code, a good second-step sign-in or the end of the 15 minutes clears the count) | Someone holding an unlocked phone can end the owner's other sessions; a stolen session gets five guesses at the code every 15 minutes, about 480 a day at a code that is right one time in 330 thousand, and can keep the owner from turning two-step off or renewing the codes for 15 minutes at a time; a lost authenticator with no recovery codes is an operator job (`docs/operations/RUNBOOK.md`) | A code to end another device, a longer wait after repeated locks, and a support process before launch |
| Switching two-step on needs only a live session: starting and confirming it ask for no fresh phone code, Google token or firm token, and nothing is sent to the owner when two-step is switched on, off or renewed. A step-up was left out of the first release on purpose, so the phone's own lock is the only check (accepted 2026-11-06) | A stolen or unlocked session can enrol its own authenticator and take the eight recovery codes. That session gains no sign-in of its own (the authenticator code is asked only after the owner's phone code, Google or firm sign-in), but every later sign-in by the owner stops at a second step only the thief can pass, so the owner is locked out until an operator steps in, and a thief whose session stays live can enrol again after a reset | Planned: a fresh phone code, or a Google or firm token issued in the last few minutes, before starting, confirming, turning off and renewing, and a text to the number on every change (a user who signed in with Google only has no number yet). Until then the operator, once the user is identified, runs `delete from user_totp where user_id = ...` and `delete from recovery_codes where user_id = ...` and, when the user did not switch two-step on themselves, `update devices set revoked_at = now() where user_id = ... and revoked_at is null` in the same sitting, because a session that stays live can enrol again; the user then signs in in one step and turns two-step on again from Security |
| The WhatsApp channel is keyed on the sender's phone number and is covered neither by two-step sign-in nor by signing a device out: a message from a linked number that Meta has signed still proposes and posts, and the device check is skipped because the channel carries no device (accepted 2026-11-08) | Someone who holds the owner's number, such as a lost phone with WhatsApp still open or a swapped SIM, can post invoices and other entries by WhatsApp after the owner has turned two-step on and ended every device in the app | A decision on whether posting over WhatsApp should need the app once two-step is on (reads would stay), or a channel tied to a signed-in device the owner can end |
| Uploads, inbound documents and mail are capped at 200 MB per business | Storage per business is bounded; growth is from businesses, not abuse | Watch the bucket size |
| Phone numbers are stored in clear in `users` | Exposure in a breach | Acceptable as the login identifier; revisit with the assessment |
| A hosted read (a query or the snapshot) is audited in the `audit_log` table only, not in the books | Not a confidentiality risk; the audit trail the app shows lists changes and not those reads, and the access log is where the owner sees who looked | Read `audit_log` into the trail if owners ask for reads there |
| Retention policy written and enforced (`docs/operations/RETENTION.md`); the periods await counsel | A period counsel changes means a code change | Counsel's sign-off |
| The privacy notice is a draft: retention periods and the Grievance Officer are placeholders | Showing it to real users before counsel approves it | Legal review, then a new version id |
| Staff role has the same permissions as accountant | Over-broad access for a billing clerk | Role review before pilot |
| Desktop default admin PIN | Known credential on first run | Force a change on first sign-in |
| The desktop page carries the local API token | Another local user on a shared Windows machine who can reach 127.0.0.1 could call the local API | Hand the token over the Electron preload bridge instead of the page |
| The app has never run on a device | Keystore and biometric paths unverified | Device testing |
| No penetration test; dependency scanning runs on every push (npm audit, dependency review on pull requests, Dependabot weekly) and CodeQL on the JavaScript | Unknown unknowns a scanner does not see | A penetration test by an outside firm before launch |

## 5. Language models

A model is used in three places, and only when `MYCA_MODEL_API_KEY` is set
(`platform/src/model-adapter.mjs`): choosing an action for a chat message the
built-in rules did not understand, translating a Hindi or Telugu message into
English, and reading a bill or receipt. In every one of them the model's answer
is treated as untrusted input.

- It receives the message, the last few chat turns, the country of the business
  and a list of actions. It does not receive the books or a key.
- The list it is given (`modelTools` in `platform/src/assistant-tools.mjs`) holds
  only actions that are previewed before they change anything and actions that
  only read. Actions that reach a government system directly, run an automation,
  read a document or change sandbox keys are never in it.
- It returns an action name and arguments. A name that was not in the list is
  refused (`MODEL_UNOFFERED_TOOL`), even when an action of that name exists. The
  arguments are checked against the action's schema, which refuses a field it
  does not name, a number above `MAX_EXACT_AMOUNT` and a field named like a
  built-in object property.
- An action that changes the books is held as a preview, and only the person's
  own next message can confirm it. A translation cannot: when a translated
  message would confirm, or would run an action the model is not given, nothing
  is done and the person is asked to write that one message plainly.
- A translation must keep every figure of the original (`figuresKept`), or it is
  discarded.
- Reading a document gives a proposed purchase with cleaned fields and posts
  nothing. Text in a document, a party name, a note or an earlier chat turn is
  data. It is never treated as an instruction to the system.
- A message the chat model does not match gets a fixed reply. It is not handed
  to a second model, and no free-text answer from a model is shown as MyCA's
  own. NVIDIA NIM answers only when the person writes "ask nim ...", the reply
  is labelled as NIM's, and the hosted service is not given a NIM key. The chat
  model's key is given to no other provider.
- What is sent is bounded: a message of at most 2,000 characters, the last six
  turns at 500 characters each, an answer of at most 1,024 tokens, 30 seconds.
- Asking the assistant is limited to 120 an hour for each person, in the app and
  on WhatsApp together. Past the limit WhatsApp sends one notice and then stays
  quiet until the hour is over.

`platform/test/red-team/prompts.mjs` holds 73 attacks: a model told to file a
return, pay tax, sign, save or clear provider keys, load demo data over real
books or run an automation; entries the person never asked for; forged earlier
turns and approvals; instructions hidden in a bill or a party name; a
translation that turns into a confirmation or changes an amount; action names
that are unlisted, empty or invented; arguments that are too large, negative or
malformed. `platform/test/red-team.test.mjs` plays each one with the model's
answer scripted to do what the attacker wants, and fails when the books change
without a preview, an action outside the list runs, or a planted key value
appears in a request to the model or in a reply. The same file runs every action
the model may run without a preview and checks the books are unchanged after it.
The set runs with the platform suite on every push. A new attack is one more
entry in the list.

Not covered by the set: what a real model does with these prompts. The answers
are scripted, so the set proves the gate holds whatever the model says, not that
the model resists.

Open, for the owner and the DPDP assessment:

- A PAN, GSTIN, Aadhaar or bank account number typed into a message reaches the
  model provider as typed, and so do party names and amounts in the six
  remembered turns. US taxpayer numbers are masked before sending
  (`redactModelRequest`); Indian identifiers are not, because the action chosen
  needs them.
- A bill or receipt that is read goes to the provider as an image. Which region
  it may be sent to, and which provider's terms are acceptable for financial
  documents, is PRD Q3.
- Seventeen nested argument objects accept fields they do not name (the free
  `params` of an approval request and of a raw provider operation, and some
  Malaysia e-invoice and US form parts). Each of them sits behind a preview or
  is never offered to the model.

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
