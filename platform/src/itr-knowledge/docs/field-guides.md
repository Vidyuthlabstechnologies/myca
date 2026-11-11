---
id: field-guides
title: How MyCA fills ITR-1 and ITR-2 field by field
source: itr-1-guide ("ITR-1_explanation by field.pdf", 27 pages) and itr-2-guide ("ITR-2_explanation by fields.pdf", 26 pages), Taxvela
applies-to: ITR-1, ITR-2
---

# How MyCA fills ITR-1 and ITR-2 field by field

The two field guides map every JSON field of ITR-1 and ITR-2 to five things: the JSON path, what the field means and its limits, the **primary source** MyCA reads it from (Form 16, AIS, the taxpayer, a computation), the **validation source** the portal cross-checks it against (Form 26AS, AIS, TRACES, the RBI IFSC list, the PAN database), and the **conflict trigger**: the condition under which the two disagree or a rule is broken. Each field is an entry in `forms/itr-1/fields.json` and `forms/itr-2/fields.json` under `guide`; ask for one with `itr_knowledge` (for example form ITR-1, field AllwncExemptUs10).

Sections 1 and 2 of each guide (creation info, form metadata) are mostly for the e-Return Intermediary integration; section 3 onward is pre-filled from the portal in most cases.

## Validation categories and what MyCA must do

| Category | Portal action | What MyCA must do | ITR-1 examples |
|---|---|---|---|
| A | The return is blocked; it cannot be uploaded and an error is shown. | Resolve every Category A conflict before the return is final. It is a hard gate. | Name not matching the PAN database; a deduction above its cap; a wrong total for an income head; a wrong digest. |
| B | The return uploads, but the taxpayer is told of a possible defect under section 139(9); CPC may send a notice. | Warn clearly before submission, explain the issue, and let the taxpayer correct it or go ahead knowingly. | TDS section codes that point to income ITR-1 cannot carry; PAN not linked with Aadhaar. |
| D | The return uploads, but a deduction or claim may be disallowed unless the supporting form is filed. | Check the supporting form (10E, 10EE, 10BA) has been filed on the portal, and tell the taxpayer before submission if not. | Relief u/s 89 without Form 10E; relief u/s 89A without Form 10EE; 80GG without Form 10BA. |

ITR-2 uses only Categories A and D (its source lists B and D together). Its Category D examples: Form 29C for AMT, Form 67 for DTAA relief, Form 10E for section 89 relief, Form 10BA for 80GG.

## Things the guides call out for ITR-1

- The digest in CreationInfo is a hash of the whole payload; it must be recomputed if any field changes, or the portal rejects the return.
- Software ID (SWCreatedBy) must be the CBDT-registered ID ("SW" and 8 digits).
- Return filed under section (ReturnFileSec): 11 = 139(1) on time, 12 = 139(4) belated, 17 = 139(5) revised, 18 = 139(9) defective-notice response, 21 = 139(8A) updated. The old regime cannot be chosen after the 139(1) due date (rule A-152).
- Standard deduction (DeductionUs16ia) is applied by regime: up to ₹50,000 old, ₹75,000 new (rules 112, 224).
- House property standard deduction is exactly 30% of annual value (rule 43).
- 112A LTCG above ₹1,25,000 makes the taxpayer ineligible for ITR-1: detect it and move them to ITR-2 before filing starts.
- Advance tax must equal the challans in Schedule IT within the advance tax dates (rule 110).
- HRA (Schedule EA 10(13A)) is the least of: HRA received, rent paid less 10% of salary (rule 271), and 50% (metro) or 40% (non-metro) of basic plus DA (rule 272).

## Things the guides call out for ITR-2

- Schedule HP: co-owner shares must total 100% (rule 68); self-occupied interest above ₹2,00,000 in the old regime, or any in the new regime, is a Category A error (rules 72, 678).
- Schedule CG: every long-term gain is split by transfer date, before or on/after 23 July 2024 (20% with indexation vs 12.5% without); 54EC investment is capped at ₹50,00,000 (rule 650).
- Schedule OS: lottery and online game winnings must also appear in Schedule SI at the special rate (rules 388, 440).
- Chapter VI-A: 80C + 80CCC + 80CCD(1) together capped at ₹1,50,000 (rule 365); none allowed in the new regime (rule 361); HUF cannot claim 80CCD(1), 80CCD(1B) or 80CCD(2) (rules 336 to 338); PRAN is needed for 80CCD(1) (rule 714); employer NPS 80CCD(2) capped at 14% of salary for government employers and in the new regime, 10% for others in the old regime (rules 358, 364, 657).

See product-vision for the behaviours (eligibility check, regime choice, AIS pre-fill, document reading, deduction interdependencies) and form16-vs-ais for the conflict process.
