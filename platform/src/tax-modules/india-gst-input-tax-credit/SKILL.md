---
name: india-gst-input-tax-credit
description: When a business in India can claim GST input tax credit (ITC) and when it must reverse it. The section 16 conditions, the GSTR-2B match, the time limit to claim, reversal for suppliers unpaid after 180 days, blocked credits under section 17(5), the order of set-off and the Invoice Management System. Use when the owner or CA asks whether credit can be taken on a bill, why credit is short, or whether a claimed credit is at risk.
license: Proprietary. Part of MyCA.
compatibility: Designed for MyCA's tax assistant. Figures in double braces are read from MyCA's dated statutory rules for the date asked about.
metadata:
  jurisdiction: "IN"
  domain: "gst"
  version: "1.0.0"
  reviewed-on: "2026-11-09"
  review-status: "awaiting CA sign-off"
allowed-tools: import_gstr2b gst_reconcile ims_review credit_at_risk gst_payable
---

# GST input tax credit

MyCA keeps every purchase bill, matches it against the imported GSTR-2B (`gst_reconcile`), lists the bills whose credit is at risk (`credit_at_risk`) and applies the set-off order when it works out the tax to pay (`gst_payable`).

## itc-conditions: Conditions for claiming input tax credit
Keywords: itc, input tax credit, claim, eligible, conditions, section 16, gstr-2b, 2b, tax invoice, received, supplier paid tax
Source: CGST Act 2017 s.16(1) and s.16(2)(a), (aa), (b), (ba), (c), (d); CGST Rules 2017 r.36

A registered person may take credit of tax charged on goods or services used, or intended to be used, in the course or furtherance of business, only when all of these hold:

1. They hold a tax invoice or debit note (or another prescribed document).
2. The supplier has furnished the invoice in GSTR-1 (or IFF) and it is communicated in the buyer's GSTR-2B.
3. The goods or services have been received (goods delivered to another person on the buyer's direction count).
4. The credit is not restricted in GSTR-2B.
5. The tax charged has actually been paid to the government by the supplier.
6. The buyer has furnished their own GSTR-3B.

Credit on goods received in lots is taken when the last lot arrives. Credit on capital goods is not available on the tax component if depreciation is claimed on it.

## itc-time-limit: Last date to claim input tax credit
Keywords: time limit, last date, deadline, claim itc, missed credit, 30 november, section 16(4), old invoice
Source: CGST Act 2017 s.16(4) as amended by the Finance Act 2022; s.16(5) and s.16(6) inserted by the Finance (No. 2) Act 2024

Credit for an invoice of a financial year cannot be taken after 30 November following the end of that year, or after the annual return for the year is filed, whichever is earlier. An invoice of FY 2025-26 can therefore be claimed in returns up to the one filed by 30 November 2026 at the latest.

Section 16(5) gives a one-time relaxation for FY 2017-18 to FY 2020-21 (returns filed by 30 November 2021), and s.16(6) for a registration restored after cancellation. Neither applies to current years.

## rule37-unpaid-supplier: Reversal when a supplier is not paid within 180 days
Keywords: 180 days, unpaid supplier, supplier paid, paid late, days, payment, reverse, reversal, rule 37, reclaim, interest, creditor
Source: CGST Act 2017 second proviso to s.16(2); CGST Rules 2017 r.37 as substituted by Notification 19/2022-CT
Rules: gst.rule37.payment-days

If the buyer does not pay the supplier the value of the supply and the tax within {{gst.rule37.payment-days}} days of the invoice date, the credit taken on it is added to the output tax in GSTR-3B for the period in which the {{gst.rule37.payment-days}} days end, with interest under s.50. When the supplier is later paid, the credit can be taken again.

Supplies without consideration that are deemed supplies under Schedule I, and tax paid under reverse charge, are outside this rule.

## rule37a-supplier-not-filed: Reversal when the supplier has not filed GSTR-3B
Keywords: rule 37a, supplier not filed, gstr-3b not filed, reverse, reclaim, 30 september, 30 november
Source: CGST Rules 2017 r.37A inserted by Notification 26/2022-CT
Rules: gst.rule37a.deadlines

Where credit was taken on invoices shown in GSTR-2B but the supplier has not filed GSTR-3B for that period by {{gst.rule37a.deadlines#supplierGstr3bBy}} of the following year, the buyer must reverse that credit by {{gst.rule37a.deadlines#reverseBy}}. It can be taken again once the supplier files.

## blocked-credits: Credit that is blocked under section 17(5)
Keywords: blocked credit, 17(5), ineligible, motor vehicle, car, vehicle, food, lunch, meals, canteen, staff welfare, catering, club, travel, construction, gift, free sample, works contract, personal use
Source: CGST Act 2017 s.17(5) clauses (a) to (i) as amended up to the Finance Act 2023
Rules: gst.itc.blocked

No credit is available, even with a valid invoice, for:

- motor vehicles for carrying up to thirteen persons (including the driver), and their insurance, repair and servicing, unless used for further supply of vehicles, passenger transport, or driving training;
- food and beverages, outdoor catering, beauty treatment, health services, cosmetic and plastic surgery, life and health insurance, unless the employer must provide them under a law, or the same category is supplied onward as part of a taxable composite or mixed supply;
- club, health and fitness memberships, and travel benefits to employees on leave or home travel concession;
- works contract services and goods or services used to construct an immovable property on one's own account (other than plant and machinery), even when capitalised;
- tax paid under the composition scheme, and goods or services for personal consumption;
- goods lost, stolen, destroyed, written off, or given away as gifts or free samples;
- tax paid on a demand involving fraud or wilful misstatement, or on detention and confiscation.

MyCA marks a purchase head as blocked when it falls in one of these classes, and leaves its tax out of the credit.

## set-off-order: Order in which input tax credit pays output tax
Keywords: set off, setoff, utilisation, igst, cgst, sgst, order, cross utilisation, section 49, rule 88a
Source: CGST Act 2017 s.49(5), s.49A and s.49B; CGST Rules 2017 r.88A
Rules: gst.setoff.order

IGST credit is used first, against IGST and then against CGST and SGST in any order and proportion. Only after the IGST credit is used up can CGST credit pay CGST (and then IGST), and SGST credit pay SGST (and then IGST). CGST credit can never pay SGST, nor SGST credit pay CGST.

`gst_payable` applies this order and shows the cash to pay under each head.

## ims: The Invoice Management System
Keywords: ims, invoice management system, accept, reject, pending, gstr-2b, deemed accepted
Source: CGST Act 2017 s.38 as substituted by the Finance (No. 2) Act 2024; GSTN advisories on IMS (live from 01.10.2024)

On the IMS dashboard the buyer accepts, rejects or keeps pending each invoice a supplier uploads. Accepted and untouched invoices flow into GSTR-2B as eligible; rejected ones do not, and a pending one waits for a later month. Rejecting an invoice the buyer has in fact received loses the credit for that month; keeping it pending is the safer choice while a query with the supplier is open.

`ims_review` lists the invoices in IMS against MyCA's purchase bills and suggests an action for each.
