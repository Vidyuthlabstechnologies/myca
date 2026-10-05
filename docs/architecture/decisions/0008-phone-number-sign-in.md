# ADR-0008: Sign in with a phone number and a one-time code

| | |
|---|---|
| Status | Accepted by the owner on 2026-10-06. The SMS sender is not chosen. |
| Date | 2026-10-06 |

## Context

The users are small business owners, their staff and their CAs. They share phones less
than they share email accounts, many have no work email, and every one of them already
receives one-time codes daily. Invitations need an identifier the owner knows for the
person invited.

## Decision

- The account identifier is the phone number. Sign-in is a six-digit code by SMS,
  valid five minutes, five tries, five codes an hour.
- A session is an access token of 15 minutes and a refresh token of 60 days bound to a
  device, rotated on use, with reuse revoking the device.
- Invitations are addressed to a phone number and stored against its hash.
- For closed testing, Google Sign-In may be used if SMS registration is not ready.

## Consequences

- No passwords to store, reset or leak.
- Sending SMS in India needs DLT registration of the sender and the message template.
  That is an owner action with a lead time; until then codes are printed to the
  console in development and the server will not start in any other mode.
- A lost or recycled phone number is an account recovery problem that needs a support
  process before launch.
- An invited person is not notified until a sender exists; they see the invitation
  after signing in.

## Alternatives rejected

- Email and password: weakest fit for the users and the most support load.
- A third-party identity platform: another processor of personal data and another
  dependency.
- WhatsApp codes only: depends on a business account and a single vendor.
