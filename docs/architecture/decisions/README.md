# Architecture decision records

One file per decision that would be expensive to reverse. A record is short: the
context, the decision, what follows from it, and what was rejected. A decision is
changed by writing a new record that supersedes the old one, not by editing history.

| # | Decision | Status |
|---|---|---|
| [0001](0001-invoice-is-the-source-of-truth.md) | The invoice is the source of truth; integer paise; append-only ledger | Accepted |
| [0002](0002-statutory-values-are-dated-rules.md) | Statutory values are dated rule records that fail closed | Accepted |
| [0003](0003-preview-then-confirm.md) | Nothing posts from chat without a preview and a confirm | Accepted |
| [0004](0004-language-model-selects-tools-only.md) | A language model may select tools; it never produces a figure | Accepted; model not chosen |
| [0005](0005-one-gate-for-external-actions.md) | One gate for every action that leaves the system | Accepted |
| [0006](0006-one-engine-two-hosts.md) | One engine, two hosts: local desktop and hosted service | Accepted |
| [0007](0007-hosted-service-on-google-cloud-mumbai.md) | Hosted service on Google Cloud in Mumbai, Postgres, one dependency | Accepted; not deployed |
| [0008](0008-phone-number-sign-in.md) | Sign in with a phone number and a one-time code | Accepted; sender not chosen |
| [0009](0009-flutter-android-first.md) | Flutter, Android first, Play Store | Accepted |
| [0010](0010-not-a-merchant-of-record.md) | The product does not become the seller of record or hold money | Accepted |
| [0011](0011-country-is-a-property-of-the-business.md) | A business has one country, chosen at creation, that selects currency, year, rules, tools and screens; India unchanged | Accepted |

## Template

```markdown
# ADR-NNNN: Title

| | |
|---|---|
| Status | Proposed, Accepted, or Superseded by ADR-NNNN |
| Date | YYYY-MM-DD |

## Context
## Decision
## Consequences
## Alternatives rejected
```
