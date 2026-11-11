# ITR knowledge base

What MyCA's AI tax assistant knows about Indian income tax returns, built from the material the owner supplied on 2026-11-11 (the "ITR knowledge" folder and the FY 2026-27 regime note). Every item names the document, and where there is one the page, it came from. `sources.json` lists all 37 source files.

## Layout

```
itr-knowledge/
  sources.json            every source file: id, title, publisher, version, date, where it is used
  docs/*.md               hand-written guides, one topic per "## " section (frontmatter: id, title, source, applies-to)
  forms/itr-N/            one folder per form, ITR-1 to ITR-6 (AY 2025-26)
    schema.json           the CBDT JSON schema, unchanged
    fields.json           every schema field flattened: path, type, required, description, allowed values, pattern, limits;
                          for ITR-1 and ITR-2 also the field guide (primary source, validation source, conflict trigger)
    rules.json            the CBDT validation rules: id (ITR-3-A-46), category, number, schedule, text, page;
                          the Form 3CD tax-audit cross-checks (ITR-3, 5, 6); ITR-5's business code list
    utility.json          the Excel utility: each sheet's line items, its help text, and its drop-down lists
    guide-prose.txt       ITR-1 and ITR-2 only: the field guide's text outside the tables
```

## Guides

| File | Topic |
|---|---|
| itr-forms.md | Which form to file; what the knowledge base holds per form |
| general-notes.md | Form families, filing season, due dates, data sources, ERI and credential filing |
| field-guides.md | Validation categories A, B, D and what MyCA must do; key field rules for ITR-1 and ITR-2 |
| form16-vs-ais.md | Four Form 16 vs AIS scenarios, the conflict process, OLTAS status codes |
| form16-structure.md | Form 16 Parts A and B line by line, mapped to ITR-1 and ITR-2 fields |
| regime-fy-2026-27.md | Old vs new regime for FY 2026-27 (checked against MyCA's dated rules by a test) |
| product-vision.md | How ITR-1 and ITR-2 filing should feel; behaviours the field guides require |
| case-study-business-return.md | A business return with books and GST: workflow, AIS comparison, ITR balance sheet and P&L, GST reconciliation |
| excel-utility.md | The department's utility, the JSON upload flow, sheets per form, drop-down lists |
| sample-returns.md | The two sample taxpayers as worked examples (identity removed) |

## How the assistant uses it

- `ask_tax` adds the best matching guide sections, rules and fields to the guidance it gives the model when a question is about a return (a form, a schedule, Form 16, AIS, validation, the JSON). The model must cite `[itr-knowledge/<ref>]` and the figure check still refuses any number not in the guidance.
- `itr_knowledge` searches everything here, or looks up one rule (`form: ITR-3, rule: A-46`) or one field (`form: ITR-1, field: GrossSalary`).
- `check_itr_json` checks a return JSON against the official schema for its form and points each error at the related validation rule.

## Rebuilding

The JSON files under `forms/` are generated; the guides are not.

```
pip install pdfplumber openpyxl      # pdftotext (poppler) must also be installed
python3 -I platform/scripts/itr-knowledge/build.py "<path to the 'ITR knowledge' folder>"
```

When the CBDT publishes AY 2026-27 schemas and rules, add them to `sources.json` and the build, and keep the AY 2025-26 folders until no return for that year can be filed.

## Limits

- The validation rules are read from PDF tables. Rules lost at page breaks are recovered from the page text (marked `"recovered": true`). ITR-5's own numbering skips 644 to 664; that gap is recorded in `numbersNotInSource`.
- MyCA checks a return against the schema only; it does not yet run the arithmetic validation rules.
- The field-guide tables are read by column position; a few long cells may be split imperfectly. `guide-prose.txt` keeps the text outside the tables.
- The original files are not in the repository: it is public, and the samples hold a taxpayer's figures. The sample ITR-2 return is kept only as an anonymised test fixture.
- Everything here is reference material for the AI and the CA, not tax advice; the CA signs off.
