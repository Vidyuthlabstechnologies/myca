# ADR-0004: A language model may select tools; it never produces a figure

| | |
|---|---|
| Status | Accepted as a constraint. No model is in use; the choice of model is open (PRD Q3). |
| Date | Recorded 2026-10-06; golden rule 1 in `AGENTS.md` since the start |

## Context

The owner's PRD asks for free-text chat and for forwarded invoices to be read
automatically. Both need a language model. A model that states a tax amount will
sometimes state a wrong one, fluently.

## Decision

- The model's output is a tool name from the fixed catalogue and arguments that pass
  that tool's strict schema. Nothing else it says is used.
- Every figure shown to the owner is either copied from the owner's message or
  document, or computed by a deterministic engine.
- For documents, the model extracts fields. Deterministic checks (GSTIN checksum, tax
  heads against place of supply, rate in force, arithmetic, duplicates) run before a
  preview is shown, and the engine recomputes every total.
- The model's choice goes through preview and confirm like any other proposal
  (ADR-0003). Tools marked as blocked for the assistant cannot be selected.
- Text inside a message or a document is data and is never treated as an instruction.
- The model sits behind an interface so the provider can change.

## Consequences

- Today's rule-based parser is a valid implementation of the same interface, which is
  why the app works without a model.
- The model needs the message and the tool catalogue, not the books. That limits what
  leaves the system.
- Questions that need reasoning over the books ("why is my tax higher this month?")
  must be answered by query tools the model calls, so new query tools will be needed.
- Evaluation is a fixed set of messages and documents with expected tool calls, run on
  every model or prompt change.

## Alternatives rejected

- Letting the model draft entries or returns directly: unverifiable figures.
- No model at all: free text and document reading in the PRD cannot be met by rules
  alone.
