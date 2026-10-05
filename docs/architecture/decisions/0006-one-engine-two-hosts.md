# ADR-0006: One engine, two hosts

| | |
|---|---|
| Status | Accepted |
| Date | 2026-10-06 (cloud phase C0) |

## Context

The product began as a local-only Windows app for CA firms. The owner's PRD is an
owner-first phone app whose data must be reachable from any device and by an invited
CA, which needs a hosted service. Rewriting the engine for the server would fork the
tax logic.

## Decision

- The engine in `platform/src` stays one codebase with no runtime dependencies.
- It reads and writes through two ports: a books store (state text and a version) and
  a document store (bytes by hash). Identity is passed in per call as the actor.
- The desktop supplies file-backed stores. The hosted API supplies in-memory stores
  loaded from one database row inside a transaction and written back at the end.
- The desktop app remains local-only. Hosting is the explicit exception recorded in
  `AGENTS.md`, not a change of posture for the desktop.

## Consequences

- A fix to tax logic lands in both products at once, and the 447 platform tests cover
  the hosted behaviour too.
- The hosted service reads and writes a business's whole state per request. Acceptable
  for small businesses; splitting the state into tables is planned (cloud phase C2).
- Anything host-specific (PIN sign-in, the Windows credential vault, file paths) must
  stay out of the engine's core path. C0 moved these behind options.
- Desktop and hosted data do not sync. A firm on the desktop and an owner on the phone
  are separate books until an import or a migration path is built.

## Alternatives rejected

- A second engine for the server: two implementations of the law.
- Hosting the desktop server as it is: single-tenant, PIN sign-in, state in a file.
- Moving everyone to hosted and retiring the desktop: CA firms asked for local data,
  and the desktop is the only product that works today without infrastructure.
