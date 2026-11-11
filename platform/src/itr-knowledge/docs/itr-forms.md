---
id: itr-forms
title: Which ITR form, and what each form's knowledge covers
source: itr-1-guide, itr-2-guide (eligibility tables); general-notes; itr-N-schema and itr-N-rules for each form. ITR-3 to ITR-7 eligibility is the CBDT's published scope for AY 2025-26 and is not in the supplied folder.
applies-to: AY 2025-26 (FY 2024-25) forms and schemas
---

# Which ITR form

## ITR-1 (Sahaj)

Can file: a **resident individual** with total income up to ₹50 lakh from salary or pension, **one** house property, other sources (interest, dividends, family pension), long-term capital gains under section 112A up to ₹1,25,000, and agricultural income up to ₹5,000.

Cannot file (use ITR-2 or higher): total income above ₹50 lakh; business or professional income; more than one house property; 112A LTCG above ₹1,25,000; a company director; holding unlisted equity shares; non-resident or resident but not ordinarily resident; agricultural income above ₹5,000. A minor (born on or after 1 April 2007) usually has income clubbed with a parent's under section 64(1A); they file on their own only for income from personal skill or talent, or where section 80U disability applies.

## ITR-2

Can file: a **resident or non-resident individual or HUF** with salary or pension, two or more house properties, capital gains of any kind (equity, mutual funds, property, bonds, crypto/VDA), 112A LTCG above ₹1,25,000, other sources (dividend, interest, winnings), foreign income or assets or DTAA relief, a director (without business income), a holder of unlisted shares, an NRI or RNOR.

Cannot file (use ITR-3 or ITR-4): any income from business or profession, including partnership income, freelance income and presumptive income under 44AD, 44ADA or 44AE.

## ITR-3

An individual or HUF with income from business or profession that cannot go in ITR-4 (books of account, partner's share, speculative or F&O income, or presumptive income above ITR-4's limits). Carries the balance sheet, P&L, depreciation, tax audit and Form 3CD cross-checks. Due date 31 August without audit (per general-notes; it used to be 31 July) or 31 October with audit.

## ITR-4 (Sugam)

A resident individual, HUF or firm (not an LLP) with total income up to ₹50 lakh and presumptive income from business or profession under 44AD, 44ADA or 44AE, plus salary, one house property and other sources.

## ITR-5

A firm, LLP, association of persons, body of individuals, local authority, artificial juridical person, cooperative society, business trust or investment fund (anyone other than an individual, HUF, company or ITR-7 filer).

## ITR-6

A company, other than one claiming exemption under section 11. Audit-backed; forms and schemas come late (general-notes).

## ITR-7

Trusts, political parties, institutions and others filing under section 139(4A) to 139(4D). Not in the supplied folder.

## What the knowledge base holds for each form

| Form | Validation rules | Schema fields | Field guide | Excel utility |
|---|---|---|---|---|
| ITR-1 | Categories A, B and D | yes | yes (Taxvela) | yes |
| ITR-2 | Category A and a combined B/D table | yes | yes (Taxvela) | yes |
| ITR-3 | A, B, D and the tax-audit (Form 3CD) cross-checks | yes | no | yes |
| ITR-4 | A, B and D | yes | no | yes |
| ITR-5 | A, a combined B/D table, Form 3CD cross-checks and a business code list | yes | no | yes |
| ITR-6 | A, B, D and Form 3CD cross-checks | yes | no | yes |

Ask the assistant with `itr_knowledge` (rules, fields, schedules, dropdowns) or `check_itr_json` (validate a return JSON against the official schema and the arithmetic rules MyCA can run).
