# MyCA PRD: CA Firm API Readiness

## Product Summary

MyCA is a Windows-first accounting and compliance workbench for Indian CA firms. It uses deterministic tools for books, GST, deadlines, filing prep, audit checks, and document workflows. The assistant may choose tools, but financial and compliance results must come from named, schema-validated tools.

This PRD defines the external API requirements needed to turn MyCA from a local reviewable MVP into a firm-ready product that can operate against real CA practice data.

## Goals

- Give CA firms a clear integration checklist before onboarding.
- Make every required API capability traceable with a stable requirement ID.
- Keep live filing, signing, OTP, and DSC actions outside autonomous assistant control.
- Preserve deterministic accounting and compliance engines as the source of truth.
- Support future OpenAI tool-calling/agent layers through strict schemas and evals.

## Non-Goals

- MyCA will not auto-file GST, income-tax, MCA, or TDS returns without explicit CA-controlled workflow.
- MyCA will not store plaintext production credentials as a long-term architecture.
- MyCA will not replace a licensed GSP where GSTN APIs require one.
- MyCA will not infer statutory positions from an LLM when a deterministic rule or CA review is required.

## Requirement IDs

| ID | Area | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|---|
| REQ-CA-001 | Client Master | Read client identity, PAN, GSTIN, entity type, state, turnover, filing frequency, and audit applicability. | Must | Readiness reports this as missing until `client_master` is connected. |
| REQ-CA-002 | Books/Ledger | Read and post invoices, purchases, receipts, payments, journals, chart of accounts, and trial balance. | Must | Readiness reports this as missing until `books_ledger` is connected. |
| REQ-CA-003 | Documents | Upload and retrieve Tally, bank, GST, AIS/26AS, and audit files by client. | Must | Readiness reports this as missing until `documents` is connected. |
| REQ-CA-004 | Firm Users | Read CA firm users, roles, reviewer permissions, and client access. | Must | Readiness reports this as missing until `firm_users` is connected. |
| REQ-CA-005 | Audit Log | Append tool runs, state changes, approvals, before/after hashes, and filing handoffs. | Must | Readiness reports this as missing until `audit_log` is connected. |
| REQ-CA-006 | GSTN/GSP | Use licensed GSP/GSTN APIs for auth, return upload, status, and portal ledger reconciliation. | GST | Readiness lists this after must-have APIs are satisfied. |
| REQ-CA-007 | NIC E-Invoice | Generate, cancel, and check IRN/e-way bill status for eligible invoices. | GST | Readiness tracks `nic_einvoice` separately from GSTN/GSP. |
| REQ-CA-008 | GSTIN Status | Validate GSTIN legal name, state, active/cancelled status, and taxpayer type. | GST | Readiness tracks `gstin_status` as a read-only integration. |
| REQ-CA-009 | AIS/26AS | Import AIS and Form 26AS data for income and TDS credit reconciliation. | Income Tax | Readiness tracks `ais_26as` as a read integration. |
| REQ-CA-010 | TDS Returns | Read/write deductee payments, sections, challans, deductions, and return-prep data. | Income Tax | Readiness tracks `tds_returns` as a read/write integration. |
| REQ-CA-011 | Tasks/Deadlines | Create, assign, update, and read compliance tasks, periods, due dates, and statuses. | Practice | Readiness tracks `task_deadline` as a practice integration. |
| REQ-CA-012 | Client Chase | Request missing documents and track collection status by client and period. | Practice | Readiness tracks `client_chase` as a practice integration. |
| REQ-CA-013 | Notifications | Send approved email, WhatsApp, or SMS reminders and internal alerts. | Practice | Readiness tracks `notifications` as a write integration. |
| REQ-CA-014 | Knowledge Base | Search firm SOPs, engagement notes, prior positions, and working papers. | AI | Readiness tracks `knowledge_base` as a read integration. |
| REQ-CA-015 | Eval Logs | Store prompts, tool calls, outcomes, reviewer corrections, and failed scenarios. | AI | Readiness tracks `eval_logs` as a write integration. |

## Readiness Rules

- The product is not firm-ready unless all must-have requirements are connected.
- If all must-have requirements are connected, the next recommended work is GSTN/GSP and NIC e-invoice.
- External filing and signing remain blocked in chat until a separate CA-controlled approval workflow exists.
- The assistant-safe tool catalog must not expose credential-save or demo-seed operations.

## Provider Integration Policy

- Cursor-built MyCA modules and sprint engines are the source of truth for books, GST reconciliation, filing prep, deadlines, and audit checks.
- Provider adapters must translate external API payloads into existing deterministic tools instead of reimplementing statutory logic.
- Sandbox by Quicko is a provider target for `REQ-CA-006` through `REQ-CA-010`, based on its GST, e-invoice/e-way bill, TDS, and income-tax API surfaces.
- GST taxpayer APIs through Sandbox require ASP onboarding with Quicko GSP or another supported GSP path; MyCA must not pretend to be a licensed GSP.
- The local CA API under `/api/ca/*` is an internal contract and test harness for must-have surfaces. It is not the production integration layer and must not replace Tally, GSTN/GSP, Sandbox, or practice-management connectors.
- Live upload, submit, file, sign, OTP, DSC, and credential operations remain CA-controlled workflows, not autonomous assistant actions.
- Sandbox operation plans must pass through the adapter contract before live implementation. The contract records requirement ID, owner modules, mapped MyCA tools, CA approval gates, and secret-redaction rules.

## Build Plan

1. Create a machine-readable requirement catalog with IDs, API directions, endpoints, and required fields.
2. Expose `integration_readiness` as a named tool.
3. Add assistant schema validation for `integration_readiness`.
4. Route "what APIs do we need" and integration-readiness questions to the tool.
5. Add tests proving every `REQ-CA-###` ID is unique, complete, and represented in readiness output.
6. Keep the local CA API surface as a contract/test harness for must-have requirements.
7. Add provider catalogs before connector work so every adapter maps to existing owner modules.
8. Later: add external connector adapters for each requirement, one at a time, with fixture-backed contract tests.

## Current Implementation Status

Implemented now:

- Requirement catalog.
- Integration readiness calculation.
- Chat-accessible readiness tool.
- Assistant schema for readiness tool.
- Persistent integration registry with connect/disconnect tools.
- APIs tab that displays all requirement IDs, metadata, endpoints, and connection state.
- Local CA API contract/test harness for must-have requirements:
  - `REQ-CA-001`: `GET /api/ca/clients`, `GET /api/ca/clients/{clientId}`.
  - `REQ-CA-002`: `GET /api/ca/clients/{clientId}/ledger`, `GET /api/ca/clients/{clientId}/trial-balance`, `POST /api/ca/clients/{clientId}/vouchers`.
  - `REQ-CA-003`: `GET/POST /api/ca/clients/{clientId}/documents`.
  - `REQ-CA-004`: `GET /api/ca/users`, `GET /api/ca/clients/{clientId}/access`.
  - `REQ-CA-005`: `GET/POST /api/ca/audit-events`, `GET /api/ca/clients/{clientId}/audit-events`.
- Sandbox provider catalog mapping:
  - `REQ-CA-006`: GST taxpayer auth, GSTR return workflows, ledgers, IMS, and GSTR-2B reconciliation jobs mapped to existing GST engines.
  - `REQ-CA-007`: E-invoice/e-way bill provider flows mapped to `platform/src/govt.mjs` and invoice tools.
  - `REQ-CA-008`: GSTIN search/verify/return tracking mapped to existing GSTIN validation tools.
  - `REQ-CA-009`: Income-tax calculator/provider outputs mapped to existing ITR reconciliation.
  - `REQ-CA-010`: TDS/TCS analytics, reports, FVU, and e-file jobs mapped to existing TDS prep.
- Sandbox adapter operation contract:
  - Read/prepare operations may map to existing tools such as `gst_reconcile`, `validate_gstin`, `prepare_itr`, and `monitor_tds`.
  - Auth/write/file operations require CA approval and are blocked for autonomous assistant actors.
  - Handoffs reject plaintext secret/OTP/token fields; live adapters must use volatile provider session references instead.
- Append-only audit events for chat runs, tool runs, file attachments, document uploads, and local CA API voucher writes.
- Tests for requirement IDs, readiness behavior, registry persistence, must-have local CA API behavior, and provider mappings.
- Live provider calls are gated behind `MYCA_ENABLE_LIVE_CALLS` (default off); the assistant and tools never reach an external provider autonomously.
- NIC credentials are encrypted at rest via an OS-backed vault (Electron `safeStorage`/DPAPI) with an AES-256-GCM fallback for plain-Node dev; no plaintext secrets are written.
- Per-client books: the firm's own books are the root ledger and every registered client gets an isolated ledger via `platform/src/books.mjs` (`POST /api/ca/clients`).
- Attachment bytes are stored content-addressed on disk (`document-store.mjs`), not inside `state.json`.

Not implemented yet:

- Live external connectors (provider adapters are catalogued and gated, not wired).
- CA approval workflow for live statutory filing.
- `REQ-CA-006` onward as production-grade external integrations.
