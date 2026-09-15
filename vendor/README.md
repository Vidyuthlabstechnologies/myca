# Vendor clones (reference only)

Do **not** import these trees from `platform/src`. GPL-3, AGPL-3, and Hisaabo's O'Saasy non-compete block shipping their source inside Bahikhata.

From `C:\Users\varsh\ca` run:

```
git clone --depth 1 https://github.com/hisaabo/hisaabo.git vendor/hisaabo
git clone --depth 1 https://github.com/resilient-tech/india-compliance.git vendor/india-compliance
git clone --depth 1 https://github.com/gnukhata/gkcore.git vendor/gkcore
```

ERPNext itself is too large to clone into this repo; use India Compliance + Frappe docs instead.

Bahikhata runtime integrations (original code):

- `platform/src/gstr1-json.mjs` — GSTN GSTR-1 JSON
- `platform/src/tally-xml.mjs` — Tally XML → Day Book CSV
- `platform/src/ledger.mjs` — TigerBeetle-style invariants
