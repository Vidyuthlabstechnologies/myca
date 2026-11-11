# Country knowledge base

One file per country, named by its ISO code in lower case. Each file is research for people and
for the assistant: what the tax authority requires of software, which licences the company must
hold, the tax calendar, indirect tax basics, data and payment rules, and what is still unknown.

Rules for these files:

- Every fact carries a source link and the file carries the date it was last checked.
- Nothing here is a statutory rule. Figures the engines compute with live in
  `sprints/statutory-rules` and need a local professional's attestation. A figure in these files
  is a pointer for the person who writes that rule, never an input to a calculation.
- When a source disagrees with another, both are kept and the conflict is said.
- Keep adding. A new finding goes under the right heading with its source and the date.

`platform/src/countries/knowledge.mjs` loads and searches these files. The platform suite fails
when a country pack has no knowledge file, when a file has no check date or no sources, or when a
file is older than its `recheck-by` date allows.
