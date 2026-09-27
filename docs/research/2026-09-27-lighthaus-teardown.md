# Lighthaus teardown and integration plan

Date: 2026-09-27. Subject: **Lighthaus** (getlighthaus.ai), launched publicly September 2026.

**Method and limits.** Everything below comes from Lighthaus's own public material: their
website (home, Meet Spark, blog) and the social links they published. No private system was
accessed and no code was decompiled; the "how it probably works" section is **inference from
the public surface**, clearly marked as such, and should not be quoted back as fact. Nothing
proprietary is copied into MyCA — what we take is problem framing and product structure,
which is not theirs to own.

Do not confuse them with **Lighthouz AI** (lighthouz.ai, San Francisco, YC, freight bill
audit and AR automation) — a different company with a similar name, whose bill-audit →
exception → dispute → collections loop is nonetheless a useful second data point, because it
is the same shape of product in a different industry.

---

## 1. What Lighthaus sells

An **AI-led accounting firm**, not accounting software. They run the books as a service and
the customer never touches a ledger.

| | |
|---|---|
| Tagline | "New era of accounting, built for Indian Businesses"; "The AI-led accounting firm for D2C brands" |
| Customer | Indian D2C / e-commerce brands selling on Amazon, Flipkart, quick commerce, Shopify, Nykaa, Myntra. Their enquiry form segments by monthly revenue from ₹0–50 L up to ₹10 Cr+ |
| Their stated claim | Automate ~80% of repetitive accounting work (from the launch post) |
| Delivery | Connect channels → AI does the routine work → their accountants review → continuous real-time management |
| Human role | "Our accountants stand behind your results" — a named team owns every filing |
| Entry offer | "Get a free books audit": 30-minute call, findings within a week of connecting data, yours to keep either way |
| Channel | Spark, an assistant on **WhatsApp and Slack**, in English, Hindi, Telugu and more |

**Their headline capabilities**, in their words:

- *Settlement reconciliation* — "Every payout, checked to the rupee." Match every Amazon,
  Flipkart and quick-commerce payout to orders, catching each fee, return and penalty;
  missing money surfaces the same day.
- *Books closed nightly* — daily closure status showing revenue journals posted, expense
  journals posted, bank reconciled, cash-flow statement updated, with an accountant's review
  stamp and a time.
- *True margins by SKU and channel* — contribution margin per channel, items flagged for review.
- *GST filed right, every state* — a filing table by state and registration type (Principal,
  Warehouse APOB) with GSTR-1 and GSTR-3B dates.

**The four compliance scenarios they lead with** (this is the sharpest part of their
positioning, because each is a real structural problem, not a feature):

1. **Multi-state GST from marketplace warehouses.** Stock in an Amazon or Flipkart
   fulfilment centre makes that state a place of business: a Hyderabad brand with FCs in
   three states needs four GSTINs. Enabling FBA multiplies the compliance surface. They
   handle new-state registrations and APOB additions, inter-GSTIN transfer invoices and
   e-way bills on every stock move, state-wise books as one system, and ITC tracked per
   state with trapped-credit exposure visible before it locks cash.
2. **The 194-O / TCS double-deduction maze.** Marketplaces deduct income-tax TDS under
   s.194-O and GST TCS on the same sales — two deductions, two departments, two portals.
   They reconcile both trails against settlements, verify TDS credit against Form 26AS,
   claim TCS GSTIN-wise, and chase shortfalls with the marketplace instead of writing
   them off.
3. **ITC capped by what suppliers actually file.** Purchase register matched against 2B
   continuously rather than at month-end, defaulting vendors flagged and chased while the
   credit is still recoverable, mismatch notices answered with a ready reconciliation trail.
4. **Books arriving ~20 days after month end**, so the founder's profit is a guess and the
   decisions are already made. Their framing: "The problem isn't your CA. It's that the
   numbers reach you too late."

**Spark** (their assistant) is worth studying on its own. The published examples show it
drafting a GST-compliant invoice from a WhatsApp message ("Raise an invoice to Nykaa for
2.4L for June PO"), stating the computed total and GST before sending, generating the
e-invoice and IRN on confirmation, booking the entry, answering a cash-flow question
("I want to buy ₹40L stock in September — can I afford it?") with a recommendation to split
the purchase, and answering in Hindi about whether a marketplace settlement matched. Their
four stated properties: answers from closed books rather than estimates, **every answer
auditable down to the entry**, reports as downloadable Excel on demand, and escalation to a
human accountant when it should.

## 2. Their thesis, from their own writing

Three posts state a strategy clearly enough to reason about.

**"The Ledger Was Never the Moat"** (CEO, 31 Aug 2026). Accounting software is "a database
with opinions"; the moat was never features but switching cost, and agentic migration is
collapsing that cost from months to days. The hours were never in the ledger — they are in
the **action layer**: chasing a gateway settlement, matching a Shopify order to a bank
credit, lining up order-level courier and RTO costs, working out why vendor invoices and the
purchase register disagree. That work *looks* like judgement, but is a thousand small
low-judgement decisions that need business context and run at volume. Their estimate: the
genuinely human part — **accountability, someone owning the number — is about 5%**. The
stack inverts: ledger becomes commodity, action layer becomes the product, accountability
stays human.

**"Where AI wins in Finance"** (25 Aug 2026). Most AI finance startups aim at the top of the
stack (forecasting, FP&A, CFO dashboards), but those outputs are only as good as the books
underneath; AI there just produces faster answers from unreliable numbers. Traction is lower
in the stack: AP processing, reconciliation and close, accounting operations. They cite
**Bench** — which established that small businesses wanted bookkeeping *done*, not another
tool, then ceased operations in December 2024 — as the warning about scaling a
human-intensive service. Their rule: "Companies that start with insights struggle to prove
accuracy. Companies that start with execution earn the right to deliver insights."

**"The Mom Test…"** (co-founder, 7 Sep 2026). Customer discovery changed their question.
Founders already had software, accountants, spreadsheets and ERPs; what they lacked was a
reliable way to make the pieces work together. The strongest signal was **behaviour, not
enthusiasm**: founders building spreadsheets, downloading marketplace reports, manually
reconciling, and pasting messy financial data into ChatGPT or Claude to reconcile books
themselves. Accountants had the mirror-image problem — context living in one person's head,
and bookkeeping being poor economics. Conclusion: customers pay for an outcome, "take care
of this for me", not for someone to operate Tally. So build software that *does* the work,
not software that helps.

## 3. How it probably works (inference, not fact)

From the public surface, a plausible architecture — useful as a checklist of what we would
need, not as a claim about them:

1. **Connectors** pull orders and settlement reports from marketplaces, payment gateways
   (Razorpay is named on their revenue tile), Shopify, bank feeds, and an accounting system.
2. A **normalising layer** turns each source into events: order, shipment, return/RTO, fee,
   penalty, payout, bank credit, stock movement between FCs.
3. A **matching engine** ties order → fees/returns → payout → bank credit, per marketplace,
   and computes the deltas that appear as their "Amazon fees + returns −₹4,86,000" tiles.
   The revenue tile showing "87.1% retained" implies a per-channel retention metric computed
   from these deltas.
4. **Rule checks** per domain: GST per registration, ITC vs 2B, 194-O/TCS vs 26AS and the
   GST portal, margin per SKU and channel.
5. Anything that does not reconcile becomes an **exception** with money attached, routed to
   an accountant ("2 Flagged for review", "Reviewed by: Lighthaus accounting team 7:40 am").
6. A **nightly close job** posts journals, reconciles the bank, updates the cash-flow
   statement, and publishes a status with percentages.
7. **Spark** sits on top as the interface: read the closed books, cite the entry, draft a
   document, ask for confirmation, act, escalate.

The important structural point is the ordering: **ingest → normalise → match → check →
exception → human → act.** Insight is produced last, from books that are already closed.

## 4. Honest comparison with MyCA

| | Lighthaus | MyCA |
|---|---|---|
| Buyer | The D2C brand directly | The CA firm; the brand gets the companion app |
| Sold as | A service ("we run your books") | Software the firm runs |
| Wedge | Marketplace settlement reconciliation | GST cycle correctness for a firm's whole client book |
| Where the numbers come from | AI agents plus accountant review | Deterministic engines over dated statutory rules; the assistant may pick a tool, never produce a figure |
| Proof of correctness | Accountants stand behind results; answers auditable to the entry | Same auditability, plus dated rule records with act/section/source and golden cases that fail closed outside their window |
| Books integrity | Not stated publicly | Append-only ledger in paise with a CRC-32 chain, per-client isolation |
| Cadence | Nightly close, same-day settlement gaps | Currently on-demand tools; no close cadence |
| Channel | WhatsApp/Slack, multilingual | Desktop chat strip; mobile is Phase 3 |
| Multi-GSTIN | Central to the product (APOB, state-wise books, inter-GSTIN transfers) | **Not modelled** — one GSTIN per book |
| Live portal actions | Implied (e-invoice/IRN generated from chat) | Behind the live switch and maker-checker approval |

**Two things they are ahead on that matter to our vision**, independent of who the buyer is:

- **The exception is the unit of work.** Their whole surface is organised around "what did
  not reconcile, what is it worth, who owns it, is it resolved". Our decision in the Phase 0
  spec — "the CA sees only exceptions plus a batch sign-off" — is exactly this, but our code
  still returns findings scattered per tool result, with no queue, no owner, no state, no
  money-at-risk.
- **A cadence.** "Books closed every night" is a product, not a feature: it converts
  accounting from a month-end reconstruction into a daily loop, and it is what makes the
  data fresh enough for the assistant to be useful.

**Where MyCA is ahead**, and should stay ahead: the rules are dated, cited and golden-tested;
an out-of-window rule fails closed instead of guessing; the ledger is tamper-evident; and no
external action can fire without an approval bound to the exact payload. Their public
material claims accuracy through human review; ours can *demonstrate* it. That is the
honest differentiator to build on, and it is worth more in the CA-firm channel than in the
founder channel, because a firm carries the professional liability.

## 5. What to take, in priority order

Each item names the target modules, and the plan or phase it belongs to.

### A. Exception queue as a first-class object — do this first
**Why:** it is the missing spine. It makes "CA reviews only exceptions" real, gives the
shadow pilot something to measure, and every engine already produces the raw material.
**What:** a new `platform/src/exceptions.mjs`, with one record shape:

```
{ id, clientId, source, code, severity, title, why, ruleIds[], moneyAtRisk,
  evidence: { invoiceIds[], transferIds[], documentIds[] },
  status: open | in_review | waived | resolved, owner, note, raisedAt, resolvedAt }
```

Feed it from what we already compute: GSTR-1 held-back invoices and `RATE_UNKNOWN`,
2B per-head mismatches and tax-type swaps, s.16(2)(aa) blocked credit, Rule 37 / 37A
reversals and their "unknown" cases, import rows skipped (`gst_rate_unknown`, `exists`),
overdue deadlines, TDS flags, trial-balance or chain failures. Every transition writes an
audit event; waiving requires a reason. Tools: `exceptions_list`, `exception_resolve`,
`exception_waive`. **Size:** medium. **Slots into:** Plan 4b, and it is the natural home for
the shadow-harness output.

### B. Daily close status per client
**Why:** cadence is the difference between books that inform a decision and books that
report history; it also gives a firm a morning worklist across all clients.
**What:** a `close_status` tool answering, per client and per day: journals posted, bank
reconciled through which date, 2B matched through which period, documents awaiting
classification, open exceptions by severity and money, next three statutory deadlines.
Render as the firm's dashboard. We already have every input. **Size:** small-medium.
**Slots into:** Phase 2, but a read-only version is cheap now and would make the pilot
legible.

### C. Multi-registration books (the real modelling gap)
**Why:** their strongest compliance argument — one FBA decision turns one GSTIN into four —
applies to any client with warehouses in several states, and our books assume a single
`company.gstin`. Any D2C client breaks our model today.
**What:** a client holds a list of registrations `{ gstin, state, type: principal | apob,
effectiveFrom }`; invoices, returns and deadlines are scoped to a registration; inter-GSTIN
stock transfers become a document type (they are taxable supplies needing an invoice and an
e-way bill); GSTR-1/3B and the deadline engine run per registration. **Size:** large, and it
touches `books.mjs`, `book-view.mjs`, `invoice.mjs`, the GST engines and the deadline engine.
**Slots into:** its own spec before Phase 1 — do not bolt it on mid-pilot.

### D. Settlement reconciliation engine
**Why:** their wedge, and the one thing a CA firm cannot do well by hand for a D2C client.
**What:** a new engine (sprint-7 shaped): ingest marketplace settlement reports and order
exports, tie order → fees → returns/RTO → penalties → payout → bank credit, and produce
per-channel retention, unexplained deductions, missing reimbursements (lost/damaged stock),
and the resulting exceptions. Reuses the matching discipline we just built for 2B: compare
per component, never on a single total. **Size:** large. **Slots into:** Phase 2, or earlier
if a pilot firm has D2C clients — it would be a strong reason for a firm to adopt.

### E. 194-O and TCS reconciliation
**Why:** a specific, checkable money leak, and we are most of the way there.
**What:** extend the TDS work: marketplace-deducted 194-O TDS and GST TCS reconciled against
settlements, 26AS and the GSTIN-wise TCS credit, with shortfalls raised as exceptions
carrying the amount and the counterparty to chase. **Size:** medium. **Slots into:** the
statutory-rules and filing engines (3b), after Phase 0.

### F. Vendor chase list from the ITC checks
**Why:** we now compute blocked credit, Rule 37 and Rule 37A correctly — but a correct number
nobody acts on saves no money. Their framing is "flagged and chased while the credit is
still recoverable".
**What:** roll our ITC findings up per supplier: credit at risk, the deadline it is at risk
by (30 September / 30 November for 37A, the 180-day date for Rule 37), and a generated
follow-up message. **Size:** small. **Slots into:** right after the exception queue, as its
first consumer.

### G. Answers that cite their evidence
**Why:** "every answer auditable, down to the entry" is the right standard, and it is also
the honest way to let an assistant speak about numbers it did not compute.
**What:** every chat answer carries the ids it came from, and the UI links them. This folds
neatly into the H10 work (preview card, one-tap confirm): the same card shows the computed
figure, the rule that produced it, and the evidence. **Size:** small once H10 is underway.

### H. Use the shadow harness as the sales artifact
**Why:** their entry offer is "a free books audit, findings within a week, yours to keep".
Our Phase 0 exit criterion already requires recomputing three months of filed returns per
pilot client and explaining every difference. That *is* a books audit.
**What:** make the shadow harness produce a client-ready report, not just an internal diff.
It becomes both the pilot proof and the reason a firm says yes. **Size:** small increment on
work already planned. **Slots into:** Plan 8 / the shadow harness.

### I. Channel and language, when mobile arrives
WhatsApp as the client-facing surface, with Hindi and Telugu, is a distribution decision as
much as a product one. Worth settling before Phase 3 design. Note that this session has a
Sarvam MCP connector available for Indian-language speech and text, which would make a
voice-note → posted entry flow testable early.

## 6. What not to copy

- **Their 5% figure.** "Only 5% of accounting is real judgement" is a good provocation and a
  bad engineering assumption. In our channel the CA carries statutory liability; the safe
  version is "5% needs judgement, 100% needs an owner and a trail".
- **A percentage claim we cannot measure.** If we ever say "80% automated", it must be a
  number the product computes — no-touch rate per job type, measured on real client data —
  not a slogan. Lighthouz AI publish "70–85% no-touch" for exactly one workflow; that is the
  honest shape of such a claim.
- **Service-heavy delivery as the default.** They cite Bench themselves. Our route stays
  software to firms, where the firm supplies the accountable humans, and we supply proof.
- **Letting the model near the arithmetic.** Their public examples are careful (Spark states
  the figures and asks before sending), but nothing in our design should depend on that
  care: the engine computes, the assistant routes, always.
- **Their marketplace-first scope, wholesale.** We are building in filing-calendar order for
  CA firms; settlement reconciliation is a client segment we can serve, not our spine.

## 7. Suggested next actions

1. Finish Phase 0 as planned — H10 and H16 are the last two high findings, and neither is
   made obsolete by anything here.
2. Build **A (exception queue)** as the first item after Phase 0's remaining findings, with
   **F (vendor chase list)** as its first consumer and **G (evidence in answers)** folded
   into the H10 chat work.
3. Add **B (daily close status)** as the firm-facing view of the queue.
4. Write a spec for **C (multi-registration books)** before any cloud work; it changes the
   data model and must not be retrofitted during a pilot.
5. Treat **D (settlement reconciliation)** and **E (194-O/TCS)** as Phase 2 candidates, moved
   up only if a pilot firm's client book demands it.
6. Re-read their blog periodically — they are publishing their strategy, and the "Building
   Lighthaus" series is a free read on what Indian D2C finance teams actually ask for.

## Sources

- [Lighthaus home](https://getlighthaus.ai/) — positioning, four-step flow, settlement
  reconciliation, nightly close, margins, GST-by-state table, the four compliance scenarios.
- [Meet Spark](https://getlighthaus.ai/meet-spark) — WhatsApp/Slack assistant, languages,
  invoice-from-chat with IRN, cash-flow question, auditable answers.
- [The Ledger Was Never the Moat](https://getlighthaus.ai/blogs/the-ledger-was-never-the-moat)
  — action-layer thesis, 5% accountability claim.
- [Where AI wins in Finance](https://getlighthaus.ai/blogs/where-ai-wins-in-finance) —
  back-office-first argument, Bench cautionary example.
- [The Mom Test and the Problem We Didn't Know We Were Solving](https://getlighthaus.ai/blogs/the-mom-test-and-the-problem-we-didnt-know-we-were-solving)
  — customer-discovery findings, "the work is the product".
- [Lighthaus on LinkedIn](https://www.linkedin.com/company/lighthaus-ai) ·
  [Instagram](https://www.instagram.com/lighthaus.ai/) — launch announcement (the ~80% claim).
- Adjacent, different company: [Lighthouz AI](https://lighthouz.ai/) — freight bill audit,
  "45+ audits per document", 70–85% no-touch, dispute agent, collections queue; the same
  ingest → audit → exception → act loop in another industry.
