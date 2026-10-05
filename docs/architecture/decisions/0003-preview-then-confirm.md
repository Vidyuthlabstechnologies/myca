# ADR-0003: Nothing posts from chat without a preview and a confirm

| | |
|---|---|
| Status | Accepted |
| Date | 2026-09-27 (audit finding H10) |

## Context

The product is chat-first. A chat that posts entries directly will sooner or later post
the wrong thing from a question ("did I invoice Rajesh?"), a negation ("don't record
that"), or a misread amount. In books that feed a tax return, that is not an
inconvenience.

## Decision

- A message that would change the books produces a proposal: the computed figures and
  the accounts that will move. The proposal is held in the books with a token.
- A separate confirm call with that token applies it. Anything else discards it.
- The confirmed proposal is remembered, so a repeated confirm returns the same result
  without posting again.
- The hosted API exposes exactly this: `propose`, `confirm`, `discard`. There is no
  remote route that posts in one step.
- Imports are proposals too, and refer to an uploaded document by hash.

## Consequences

- Every entry costs the owner one extra tap. This is the price of principle P3.
- The proposal must be small enough to persist (64 KB), which is why imports hold a
  document hash and not the file.
- Today there is one pending proposal per business, so two members previewing at the
  same moment replace each other's preview. Nothing wrong is posted. Keying proposals
  by member is planned.
- POS sales are the one planned exception: the owner approves the connection and a
  daily total, not each sale (feature spec 09).

## Alternatives rejected

- Post, then offer undo: an append-only ledger has no undo, only reversal, and a
  reversal in a locked period is not possible.
- Confidence thresholds that skip the preview: the cases that matter are the confident
  mistakes.
