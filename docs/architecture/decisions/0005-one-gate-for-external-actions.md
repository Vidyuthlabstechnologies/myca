# ADR-0005: One gate for every action that leaves the system

| | |
|---|---|
| Status | Accepted |
| Date | 2026-09-21 (audit findings C2, C3, H8, H9) |

## Context

Filing a return, generating an e-invoice or an e-way bill, and sending a message are
acts with legal or reputational effect that cannot be taken back. The audit found
provider clients that could be called directly from tools, with approvals that were
not tied to what was actually sent.

## Decision

- `action-gate.mjs` is the only path to an external system. An architecture test fails
  if a transport is reachable any other way.
- The gate checks, in order: the action is declared; the assistant is not attempting a
  blocked write; parameters are plain JSON; the preflight passes; with the live switch
  off a mock fixture answers; the live switch `MYCA_ENABLE_LIVE_CALLS` is on; an
  approval exists bound to the operation, the business and a hash of the payload; the
  approver is not the requester and holds an approver role; the deadline has not
  passed.
- Every outcome is audited, including an unknown outcome after a timeout.
- OTP, EVC and DSC are supplied by the taxpayer at the time and are not stored.
- `runtime-config.mjs` is the only source of the live switch.

## Consequences

- Adding an integration means declaring an action, a preflight and a mock fixture
  before any network code.
- Development and tests never reach a real portal by accident.
- Maker and checker must be different people. A business with one member cannot
  approve its own filing today. Whether an owner may approve alone is a product
  decision (PRD Q2) and would be a deliberate change to this record.
- The hosted server refuses to start with the live switch on until per-business
  credentials exist.

## Alternatives rejected

- Checks inside each provider client: this is what failed the audit.
- A confirmation dialog in the interface only: the interface is not a security
  boundary.
