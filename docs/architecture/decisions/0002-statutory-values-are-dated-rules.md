# ADR-0002: Statutory values are dated rule records that fail closed

| | |
|---|---|
| Status | Accepted |
| Date | 2026-09-21 (Phase 0 design) |

## Context

The September 2026 audit found that sprint specifications and their tests had encoded
wrong tax law in several places, and that rates and thresholds were constants inside
engines. Tax law changes by notification, often mid-year, and a figure that was right
last year is a silent error this year.

## Decision

- Every rate, threshold, slab, due date and state code is a record in
  `sprints/statutory-rules` with its act, section, source, the dates it is in force,
  and attestations.
- Engines ask for a rule by id and date. Outside its dates the answer is
  `RULE_NOT_IN_FORCE`. There is no fallback to the nearest or the latest value.
- Golden case files pin the arithmetic for each rule area.
- The authority for a rule is the Act, the rule or the notification. A specification
  or an existing test is not authority.
- A rule is not treated as verified until the advisor CA has attested it.

## Consequences

- When the law changes, the product refuses to compute for the new period until the
  rule is added. This is the intended behaviour.
- A rule change is a reviewed code change with a test, not a production data edit.
- The advisor CA is a real dependency: until one is named, rules are engineering's
  reading of the law and must be described as such.
- The Income-tax Act, 2025 came into force on 1 April 2026; rule records for periods
  from that date must cite it, and records for earlier periods must cite the 1961 Act.

## Alternatives rejected

- Constants in code: what the audit found.
- A rules table editable in production: no review, no test, no history.
- Defaulting to the most recent rule: wrong figures with no warning.
