---
name: india-gst-returns
description: Indian GST return obligations for a registered business. GSTR-1 and GSTR-3B due dates (monthly and QRMP), the invoice furnishing facility, B2C large invoices, late fees, interest on late tax, the GSTR-9 annual return and how corrections are made. Use when the owner or CA asks when a GST return is due, what a late return costs, what goes into GSTR-1 or GSTR-3B, or how to correct a filed return.
license: Proprietary. Part of MyCA.
compatibility: Designed for MyCA's tax assistant. Figures in double braces are read from MyCA's dated statutory rules for the date asked about.
metadata:
  jurisdiction: "IN"
  domain: "gst"
  version: "1.0.0"
  reviewed-on: "2026-11-09"
  review-status: "awaiting CA sign-off"
allowed-tools: gst_review gst_period_summary prepare_gstr1 prepare_gstr3b gst_payable gstr9_draft track_gst_returns
---

# GST returns

MyCA drafts GSTR-1 and GSTR-3B from posted invoices, so the books are the source and the return is a projection of them. Use `gst_review` to walk the month's draft and `gst_period_summary` for the figures.

## gstr1-due: When GSTR-1 is due
Keywords: gstr-1, gstr1, outward supplies, due date, monthly, quarterly, qrmp, iff, invoice furnishing facility
Source: CGST Act 2017 s.37; CGST Rules 2017 r.59 (QRMP and IFF under r.59(2))
Rules: due-date.gst.gstr-1.monthly, due-date.gst.gstr-1.quarterly, due-date.gst.iff

A monthly filer furnishes GSTR-1, the statement of outward supplies, by {{due-date.gst.gstr-1.monthly}}. A taxpayer in the Quarterly Return Monthly Payment (QRMP) scheme furnishes it by {{due-date.gst.gstr-1.quarterly}}.

In the first two months of a quarter a QRMP filer may upload B2B invoices through the optional Invoice Furnishing Facility (IFF) by {{due-date.gst.iff}}, so their buyers see the credit in GSTR-2B that month instead of waiting for the quarter.

GSTR-1 must be filed before GSTR-3B for the same period: the portal builds the outward liability in GSTR-3B from it.

## gstr3b-due: When GSTR-3B is due
Keywords: gstr-3b, gstr3b, summary return, due date, monthly, quarterly, qrmp, pmt-06, pay tax
Source: CGST Act 2017 s.39(1) and s.39(7); CGST Rules 2017 r.61 and r.61A
Rules: due-date.gst.gstr-3b.monthly, due-date.gst.gstr-3b.quarterly, due-date.gst.pmt-06

A monthly filer files GSTR-3B and pays the tax by {{due-date.gst.gstr-3b.monthly}}. A QRMP filer files GSTR-3B for the quarter on a date that depends on the state of registration ({{due-date.gst.gstr-3b.quarterly}}), and in the first two months of the quarter pays tax through challan PMT-06 by {{due-date.gst.pmt-06}}.

Tax is paid first from the electronic credit ledger and the balance from the electronic cash ledger. Interest is charged only on the part paid in cash late.

## late-fee: Late fee for a late GSTR-3B or GSTR-1
Keywords: late fee, penalty, late filing, gstr-3b, gstr-1, nil return, per day, section 47
Source: CGST Act 2017 s.47; Notification 19/2021-CT and its successors (fee waivers and caps by turnover)
Rules: gst.late-fee.gstr3b, gst.late-fee.gstr1

A late GSTR-3B attracts a late fee of {{gst.late-fee.gstr3b#perDayPaise.normal}} a day (CGST and SGST together), or {{gst.late-fee.gstr3b#perDayPaise.nil}} a day for a nil return, up to a cap that depends on the previous year's turnover. GSTR-1 has the same daily fee ({{gst.late-fee.gstr1#perDayPaise.normal}}, or {{gst.late-fee.gstr1#perDayPaise.nil}} for nil).

The late fee is paid in cash; input tax credit cannot pay it.

## interest: Interest on GST paid late
Keywords: interest, late payment, delay, section 50, net cash, 18 percent, cash ledger
Source: CGST Act 2017 s.50(1) and its proviso (interest on the net cash liability, inserted by the Finance Act 2021 with effect from 01.07.2017)
Rules: gst.interest.rate

Tax paid after the due date carries interest at {{gst.interest.rate#percentPerAnnum}} per annum, counted from the day after the due date to the day of payment, on the part of the tax paid through the cash ledger. Tax discharged from credit already in the credit ledger on the due date carries no interest under the proviso.

## b2cl: B2C large invoices in GSTR-1
Keywords: b2cl, b2c large, unregistered, inter-state, interstate, invoice value, gstr-1 table 5
Source: CGST Rules 2017 r.59(4)(b)(i); Notification 12/2024-CT (limit reduced with effect from 01.08.2024)
Rules: gst.b2cl.threshold

An inter-state invoice to an unregistered buyer is reported invoice by invoice (B2CL) when its value exceeds {{gst.b2cl.threshold|paise}}. Smaller ones are summarised by state and rate as B2CS.

## gstr9: Annual return GSTR-9
Keywords: gstr-9, gstr9, annual return, gstr-9c, reconciliation statement, exemption, turnover
Source: CGST Act 2017 s.44; CGST Rules 2017 r.80 and its provisos; exemption notifications for small taxpayers
Rules: gst.gstr9.exemption-threshold, due-date.gst.gstr-9

GSTR-9 for a financial year is due by {{due-date.gst.gstr-9}}. A taxpayer whose aggregate turnover for the year is up to {{gst.gstr9.exemption-threshold|paise}} is exempted from filing it for the years the notifications cover.

Use `gstr9_draft` to build the annual figures from the monthly returns MyCA prepared.

## corrections: Correcting a filed GST return
Keywords: amend, amendment, correct, correction, mistake, revise, revised return, wrong invoice, credit note
Source: CGST Act 2017 s.37(3) and s.39(9) as amended by the Finance Act 2022; s.34 (credit and debit notes)

A filed GSTR-1 or GSTR-3B cannot be revised. A mistake is corrected in a later period's return: invoice details are amended in GSTR-1 (the amendment tables), and an under- or over-reported figure is adjusted in a later GSTR-3B. The last date for these corrections for a financial year is 30 November after the year ends, or the date the annual return is filed if earlier.

A change in value after the invoice (a return of goods, a discount agreed earlier, a price revision) is made with a credit or debit note, which is reported in the period it is issued.
