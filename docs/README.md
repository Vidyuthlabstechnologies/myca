# Documentation

Start with the product PRD, then the architecture. Everything else is reference.

## Product

| Document | Read it for |
|---|---|
| [Product PRD](product/PRD.md) | What the product must do, as numbered requirements with status |
| [Roadmap](product/ROADMAP.md) | The order of work and what each milestone waits on |
| [Progress tracker](superpowers/PROGRESS.md) | The current percentages and how they are computed |

### Feature specifications

| # | Feature | Status |
|---|---|---|
| [01](product/features/01-accounting-and-tagging.md) | Automatic accounting and smart tagging | Accounting built; expense tagging not |
| [02](product/features/02-invoices-quotes-eway-bills.md) | Invoices, quotes and e-way bills | Invoices built; sending, quotes not |
| [03](product/features/03-gst-returns.md) | GST returns, review and file | Drafts, review, set-off and recorded filings built; live filing not |
| [04](product/features/04-tds.md) | TDS | Monitor, deduction on entries, deposits, quarterly draft and review built; filing not |
| [05](product/features/05-payroll.md) | Payroll | Not built |
| [06](product/features/06-gstr2b-matching-and-reminders.md) | GSTR-2B matching and supplier reminders | Engine built; app and reminders not |
| [07](product/features/07-ca-collaboration.md) | CA collaboration | Invite built; export and sync setting not |
| [08](product/features/08-chat-and-dashboard.md) | Chat and dashboard | Chats built; free text and dashboard partly |
| [09](product/features/09-document-capture-and-pos.md) | Reading documents and POS sales | File imports built; the rest not |

## Architecture

| Document | Read it for |
|---|---|
| [System architecture](architecture/ARCHITECTURE.md) | Components, request flow, the action gate, known limits |
| [Data model](architecture/DATA-MODEL.md) | Database tables, the books state, where data lives on each device |
| [Security and privacy](architecture/SECURITY-AND-PRIVACY.md) | Controls that exist and gaps that do not have one yet |
| [Decision records](architecture/decisions/) | Why the system is the way it is; ten decisions |
| [Cloud backend design](superpowers/specs/2026-10-06-cloud-backend-design.md) | The hosted service in detail, with what was built in C0 and C1 |
| [Phase 0 design](superpowers/specs/2026-09-21-phase0-pilot-readiness-design.md) | Hardening the engine before a pilot |

## Engineering

| Document | Read it for |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Conventions, invariants and the checklist for a change |
| [`STATUS.md`](../STATUS.md) | Inventory of what is built and verified |
| [`DEPLOYMENT.md`](../DEPLOYMENT.md) | Site and Windows release pipeline |
| [`cloud/README.md`](../cloud/README.md) | Running the hosted API locally |
| [`mobile/README.md`](../mobile/README.md) | Running and testing the app |
| [Codebase audit](audit/2026-09-21-codebase-audit.md) | Findings C1 to C4 and H1 to H18, all closed |
| `sprints/*/BENCHMARK.md` | Engine fixtures and expected numbers |

## Desktop product for CA firms

| Document | Read it for |
|---|---|
| [`platform/PRD.md`](../platform/PRD.md) | CA-firm API requirements REQ-CA-001 to 015 |
| [`platform/CA-REVIEW.md`](../platform/CA-REVIEW.md) | Reviewer walkthrough and stated limits |
| [`platform/INTEGRATIONS-SETUP.md`](../platform/INTEGRATIONS-SETUP.md) | Taking an integration live |
| [`platform/INTEGRATION-RECONCILIATION.md`](../platform/INTEGRATION-RECONCILIATION.md) | Provider adapter policy |

## Research

| Document | Read it for |
|---|---|
| [Merchant-of-record decision memo](research/2026-10-05-taxmeow-decision-memo.md) | Why the product does not become seller of record. Read the correction at the top. |
| [Lighthaus teardown](research/2026-09-27-lighthaus-teardown.md) | A competitor's product |
| [Lighthaus revisited](research/2026-10-06-lighthaus-revisited.md) | The same competitor against Taxmeow as built, and what to take |
| [Lighthaus, third look](research/2026-10-16-lighthaus-third-look.md) | The same competitor re-scored against the build on 16 October: seven of eleven gaps closed, what is left and why |
| [Public APIs review](research/2026-09-27-public-apis-review.md) | Government and provider APIs |

## Keeping documents honest

- A requirement's status changes in the PRD in the same commit as the code that
  changes it.
- A decision that is expensive to reverse gets a decision record before the code.
- No document states a tax rate, threshold or due date. Those live in
  `sprints/statutory-rules` with their citations; documents point there.
- "Built" means implemented and covered by tests. It does not mean deployed, and it
  does not mean verified against a live portal.
