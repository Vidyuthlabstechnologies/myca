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

- Phone and one-time code. Codes are stored as salted hashes, expire in five minutes,
  allow five tries, and are limited to five an hour per number.
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

### What the network can reach

- Remote callers can propose nine write tools and the importers, and query a fixed list
  of read tools. The rest of the tool catalogue is not reachable.
- Every tool has a strict schema with no additional properties.
- Imports refer to an uploaded document by hash; inline content is refused.
- Request bodies are capped (uploads at 8 MB).

### Actions that leave the system

- The action gate, described in the [architecture](ARCHITECTURE.md#7-the-action-gate).
- The live switch is off by default, and the hosted server refuses to start with it on.
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

### Supply chain

- The engine has no runtime dependencies. The hosted API has one (`pg`). The app has
  seven packages. `vendor/` is never imported.

## 4. Gaps, stated plainly

| Gap | Risk | Needed |
|---|---|---|
| Not deployed, so no TLS, network policy, backups or monitoring exist | None yet; all of it before the first real user | Deployment design in the cloud backend spec |
| No encryption of the books column beyond what the database provides | A database administrator can read every business | Decide on per-business envelope encryption |
| No staff access control or access log for production data | Insider access is invisible | Break-glass access with logging before launch |
| No rate limit beyond sign-in codes | Abuse of the API by a signed-in device | Per-device and per-business limits at the edge |
| No limit on total uploads per business | Storage exhaustion | Quotas |
| Phone numbers are stored in clear in `users` | Exposure in a breach | Acceptable as the login identifier; revisit with the assessment |
| Reads write an audit event into the books row | Not a confidentiality risk; a contention and cost issue | Separate read path |
| Retention policy is not written | Account deletion cannot be completed correctly: tax law requires records to be kept for years, privacy law requires deletion on request | Legal advice, then implement both |
| No consent or notice screens | DPDP Act duties | Privacy notice, consent record, grievance contact |
| Staff role has the same permissions as accountant | Over-broad access for a billing clerk | Role review before pilot |
| Desktop default admin PIN | Known credential on first run | Force a change on first sign-in |
| The app has never run on a device | Keystore and biometric paths unverified | Device testing |
| No penetration test, no dependency or secret scanning in a working CI | Unknown unknowns | Before launch |

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
financial information, files; none shared with third parties today), account deletion
reachable from inside and outside the app, and a justification for each permission
(biometric today; camera and storage when capture is built). None of this is started.

## 7. Reporting a vulnerability

There is no public process yet. Until there is, report to the repository owner
privately; do not open a public issue.
