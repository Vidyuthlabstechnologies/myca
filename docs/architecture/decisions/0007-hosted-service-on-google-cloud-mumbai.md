# ADR-0007: Hosted service on Google Cloud in Mumbai, Postgres, one dependency

| | |
|---|---|
| Status | Accepted by the owner on 2026-10-06. Not deployed. |
| Date | 2026-10-06 |

## Context

The hosted service holds the master copy of each business's books. The data is
financial and personal, the users are in India, and the repository already has
Terraform and a release pipeline on Google Cloud for the marketing site.

## Decision

- Google Cloud, region asia-south1 (Mumbai). Cloud Run for the API, Cloud SQL for
  Postgres, Cloud Storage for documents, Secret Manager for secrets.
- Postgres is the only database. Each request runs in one transaction that locks one
  business's books row.
- The `cloud/` package may depend on the Postgres driver `pg` and nothing else. The
  engine in `platform/` stays dependency-free.
- No ORM, no web framework: the API is `node:http` with a small router.

## Consequences

- Data stays in India by construction, which simplifies the privacy position.
- One row lock per business gives correct serialization with no application-level
  locking, at the cost of contention inside a busy business.
- Cloud Run scales to zero, which suits a pilot with a handful of businesses.
- High-volume shops wait for the state to be split into tables (phase C2).
- A Google Cloud project with billing is needed before anything can be deployed. That
  is an owner action and is open.

## Alternatives rejected

- A document database or Firebase: weaker transactions for a ledger, and a second
  permission model to audit.
- One database per business: operationally heavy at the scale of thousands of small
  businesses.
- A managed backend platform: more dependencies and less control over data location.
