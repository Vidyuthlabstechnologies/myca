#!/usr/bin/env python3
"""Build MyCA Product Guide PDF for CA review."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
    Spacer, Table, TableStyle, Image, PageBreak, KeepTogether, CondPageBreak)
from reportlab.lib import colors

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else os.getcwd()
# When run with cwd=project root, screens live here:
SCREEN_DIR = os.path.join("docs", "review", "ca-pitch-deck", "screens")
OUT = os.path.join("docs", "review", "MyCA-Product-Guide.pdf")

NAVY = HexColor("#1B2A4A")
TEAL = HexColor("#0F766E")
SLATE = HexColor("#334155")
MUTED = HexColor("#64748B")
LINE = HexColor("#CBD5E1")
BG = HexColor("#F1F5F9")
CREAM = HexColor("#FAFAF8")

styles = {}
styles["cover_title"] = ParagraphStyle("cover_title", fontName="Helvetica-Bold", fontSize=30, leading=34, textColor=NAVY, alignment=TA_LEFT)
styles["cover_sub"] = ParagraphStyle("cover_sub", fontName="Helvetica", fontSize=11, leading=15, textColor=SLATE, alignment=TA_LEFT)
styles["h1"] = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=17, textColor=NAVY, spaceBefore=14, spaceAfter=6, keepWithNext=True)
styles["h2"] = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=HexColor("#0F2A44"), spaceBefore=10, spaceAfter=4, keepWithNext=True)
styles["h3"] = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=SLATE, spaceBefore=8, spaceAfter=3, keepWithNext=True)
styles["body"] = ParagraphStyle("body", fontName="Helvetica", fontSize=9.3, leading=13.5, textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=4)
styles["bullet"] = ParagraphStyle("bullet", parent=styles["body"], alignment=TA_LEFT, leftIndent=12, firstLineIndent=0, bulletIndent=5, spaceAfter=2)
styles["caption"] = ParagraphStyle("caption", fontName="Helvetica-Bold", fontSize=8.2, leading=10.5, textColor=NAVY, alignment=TA_LEFT, spaceAfter=1)
styles["caption_body"] = ParagraphStyle("caption_body", fontName="Helvetica", fontSize=7.8, leading=10.5, textColor=SLATE, alignment=TA_LEFT, spaceAfter=0)
styles["table_cell"] = ParagraphStyle("table_cell", fontName="Helvetica", fontSize=8.2, leading=11, textColor=SLATE, alignment=TA_LEFT)
styles["table_head"] = ParagraphStyle("table_head", fontName="Helvetica-Bold", fontSize=8.2, leading=11, textColor=colors.white, alignment=TA_LEFT)
styles["footer"] = ParagraphStyle("footer", fontName="Helvetica", fontSize=7, leading=8, textColor=MUTED, alignment=TA_CENTER)
styles["toc"] = ParagraphStyle("toc", fontName="Helvetica", fontSize=9.3, leading=14, textColor=SLATE, alignment=TA_LEFT)

def p(text, style="body"):
    return Paragraph(text, styles[style])

def bullet(text):
    return Paragraph(text, styles["bullet"], bulletText="\u2022")

def styled_table(headers, rows, col_widths):
    data = [[Paragraph(h, styles["table_head"]) for h in headers]]
    for r in rows:
        data.append([Paragraph(c, styles["table_cell"]) for c in r])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("BACKGROUND", (0,1), (-1,-1), colors.white),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, HexColor("#F8FAFC")]),
        ("GRID", (0,0), (-1,-1), 0.5, LINE),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ]))
    return t

def rule():
    t = Table([[""]], colWidths=[170*mm])
    t.setStyle(TableStyle([("LINEBELOW", (0,0), (-1,0), 0.7, LINE)]))
    return t

story = []

# ---------- COVER ----------
story.append(Spacer(1, 22*mm))
story.append(p("MYCA", "cover_sub"))
story.append(p("Product Guide<br/>for CA Review", "cover_title"))
story.append(Spacer(1, 4*mm))
story.append(p("What the product is today, how a CA firm would use it, and what each screen proves. Prepared for Sanjay and two reviewing Chartered Accountants.", "cover_sub"))
story.append(Spacer(1, 6*mm))
story.append(rule())
story.append(Spacer(1, 5*mm))

cover_meta = [
    ["Date", "30 October 2026"],
    ["Sources", "STATUS.md as of 14 Oct 2026 &middot; mobile golden screens &middot; platform CA-REVIEW"],
    ["Verification", "Platform 682/682 &middot; Engines 330/330 &middot; Android 166 widget tests &middot; CI green"],
    ["Scope", "Agenda 1 — how the product will be &nbsp;&nbsp;|&nbsp;&nbsp; Agenda 2 — clarifications from the document"],
    ["Classification", "Confidential — for review discussion only"],
]
story.append(styled_table(["", ""], cover_meta, [32*mm, 138*mm]))
story.append(Spacer(1, 6*mm))
story.append(p("How to use this guide in the meeting: start at &sect;1 for the 10-minute overview, use &sect;2 when a question from the document comes up, then walk &sect;3 screen by screen. &sect;4 lists what is verified, what is not built, and the open questions left for agenda 3.", "body"))
story.append(p("A note on honesty used throughout: &ldquo;Verified&rdquo; means covered by tests or an actual run — not merely written. Anything not yet against a live portal is labelled as such.", "body"))

# ---------- CONTENTS ----------
story.append(p("Contents", "h1"))
toc_items = [
    ("1 &nbsp; How the product will be — for a CA firm", "4"),
    ("2 &nbsp; Clarifications from the document", "6"),
    ("3 &nbsp; Screen walkthrough in flow order (all screens)", "8"),
    ("&nbsp;&nbsp;&nbsp;&nbsp;A &nbsp; First run and migration", "8"),
    ("&nbsp;&nbsp;&nbsp;&nbsp;B &nbsp; Recording a sale — preview, then post", "12"),
    ("&nbsp;&nbsp;&nbsp;&nbsp;C &nbsp; Taxes and the invoice as proof", "15"),
    ("&nbsp;&nbsp;&nbsp;&nbsp;D &nbsp; Expenses without double-posting", "17"),
    ("&nbsp;&nbsp;&nbsp;&nbsp;E &nbsp; Corrections and maker-checker review", "18"),
    ("&nbsp;&nbsp;&nbsp;&nbsp;F &nbsp; Books check, cash and quote", "21"),
    ("4 &nbsp; What is verified, what is not, and open questions", "23"),
]
for title, pg in toc_items:
    story.append(p(f"{title}", "toc"))

# ---------- SECTION 1 ----------
story.append(p("1 &nbsp; How the product will be — for a CA firm", "h1"))
story.append(rule())
story.append(p("MyCA is a Windows-first, local-only accounting and compliance workbench for Indian SMBs, with a phone app for the owner. One local server holds the books. The phone holds no tax logic — every figure on screen comes from the server engine. The hosted API is the one deliberate exception so the phone works outside the office; it runs the same engine code.", "body"))
story.append(p("The invoice is the source of truth", "h2"))
story.append(p("Sales, purchases, receipts, expenses and credit notes post to an append-only double-entry ledger in integer paise. Debit must equal credit on every transfer; the journal carries a checksum chain; a wrong entry is cancelled or reduced by a credit note, never edited. Trial balance, GSTR-1 / 3B tables and the audit flags are projections of posted invoices, not a second typing pass. The same books and the same date always give the same result.", "body"))
story.append(p("Who uses what", "h2"))
story.append(styled_table(["Role", "Uses", "Sees and approves"],
    [
        ["Owner / staff", "Phone app: one thread per customer or supplier, plus Sales, Purchases, Taxes registers and Home dashboard.", "Types a sale, forwards a supplier bill, previews what will post, taps confirm. Filing and reminders always need this approval."],
        ["Firm staff", "Windows app: chat plus Vouchers, Books, GST, Documents, Clients, Approvals, Firm, Govt, Print tabs.", "Imports Tally / Zoho / bank files, prepares returns, answers queries, requests missing documents."],
        ["Reviewing CA", "Approvals, period lock, audit log, filing pack.", "Reviews drafts step by step, approves or rejects gated operations, locks the period, signs where the law requires."],
    ], [30*mm, 62*mm, 78*mm]))
story.append(Spacer(1, 2*mm))
story.append(p("Operating model in a firm", "h2"))
story.append(bullet("Each client gets <b>isolated books</b> under one firm login. Switching clients switches the whole app to that ledger; the firm&apos;s own books are the root ledger."))
story.append(bullet("<b>Daily:</b> sales, supplier bills, receipts, expenses arrive from chat, POS, or file import. Each posts only after a preview and a confirm. Questions and negations post nothing."))
story.append(bullet("<b>Weekly:</b> document chase (what is missing, by client and period), payment run ranked on MSMED / 180-day / agreed terms, customer reminders drafted — sent only on approval. MyCA moves no money."))
story.append(bullet("<b>Monthly:</b> GSTR-1 tables and GSTN offline JSON, GSTR-3B draft, 2B match per tax head, Rule 37 (180-day) and Rule 37A (supplier 3B) as separate checks, 1-vs-3B match, deadline rollover over weekends and gazetted holidays, ITR regime compare, TDS threshold monitor, full-population audit with SA 230 papers and Schedule III / CARO / 3CD checks."))
story.append(bullet("<b>Controls throughout:</b> maker-checker approval (requester cannot approve own request, 24-hour expiry, single use), period lock, append-only audit log with before / after hashes, content-addressed documents re-verified on every read, secrets in the OS vault."))
story.append(p("What the phone deliberately does not do", "h2"))
story.append(p("The app computes nothing. Forms send structured arguments to <font face=\"Helvetica-Bold\">/api/propose</font>, which returns the engine&apos;s preview and a one-use token; the confirm call posts it. Totals within 50 paise and dates within 3 days of an existing entry are offered as attachments to that entry instead of posting twice. Reports show the engine&apos;s total and the comparison with the prior period, verbatim.", "body"))

# ---------- SECTION 2 ----------
story.append(p("2 &nbsp; Clarifications from the document", "h1"))
story.append(rule())
story.append(p("The questions below come up in almost every first CA reading of the PRD, STATUS and CA-REVIEW pack. Answers are kept to what is true today.", "body"))
story.append(styled_table(["Question from the document", "Answer"],
    [
        ["Is this for CA firms or for owners?", "Both, with the firm as the buyer. The owner gets the phone thread and the dashboard so compliance takes minutes. The firm gets the Windows workbench, all clients in one place, and every control it needs to sign. The owner can export entries or invite the CA, with real-time or interval sync."],
        ["Does it file returns by itself?", "No. It prepares, reconciles, flags and documents. Save and file go through the action gate: live switch <b>plus</b> a CA approval bound to the exact payload hash. The acknowledgement is saved in chat. There is no autonomous filing, signing, OTP or DSC path."],
        ["Does it replace Tally / Zoho?", "No. It lands Tally Day Book CSV and TallyPrime XML, Zoho Books invoice CSV, and bank CSV / fixed-width / PDF with running-balance tie-out — with row isolation and duplicate protection. Tally push on this machine and Zoho invoice push exist as gated write paths; the ledger of record stays MyCA&apos;s append-only journal."],
        ["What about GSTN, GSP and e-invoice?", "Sandbox by Quicko paths are wired (GSTIN verify, return status, 2B recon job, GSTR-1 save / file, e-invoice auth / generate / cancel, TDS jobs) and verified live against the sandbox TEST environment. NIC e-invoice runs the full v1.04 IRP surface with mock and live heartbeat verified. Production still needs GSP onboarding, real credentials and the live switch. Two contract routes stay fail-closed as NOT IMPLEMENTED until a verified endpoint exists."],
        ["Where does the data live?", "On the firm&apos;s machine by design: state.json plus content-addressed document bytes on disk, one verified backup a day (fourteen kept), PINs kept encrypted beside the books and never in backups. Hosted tenancy (one locked books row per business, sealed connector credentials, access log, nightly purge per retention policy) applies only to the phone backend. No plaintext secrets in code, logs or state."],
        ["Does the AI invent figures?", "Never. The assistant may only choose a named tool with a strict schema; every amount comes from a deterministic engine with act, section, source and dated validity. A rule asked for outside its window fails closed. The model drafts wording and proposes an expense head (labelled as the model&apos;s, changeable); a translation that changes any figure is refused."],
        ["What do the test counts actually mean?", "Platform 682/682, engines 330/330 (11/11/49/51/68/2 plus 138 statutory-rule tests), Android 166 widget tests, hosted API suite against Postgres in CI, plus end-to-end smoke on Windows. Sprint 1–6 engines are libraries with CLIs; platform wraps them into the product. GCP Terraform validates but has never been applied; installer verified as NSIS + portable EXE."],
        ["What is honestly not built?", "No deployed backend, no Play / App Store submission (india flavour ships no Plaid SDK; global adds it), no signed iPhone run yet, no iOS share extension, no live GSTN upload / DSC production path without onboarding, no MCA21 / payroll statutory / WhatsApp collection. Mock mode (MYCA_MOCK_MODE=1) demos the whole flow offline with explicitly tagged fixtures."],
    ], [48*mm, 122*mm]))

# ---------- SECTION 3 intro ----------
story.append(p("3 &nbsp; Screen walkthrough in flow order", "h1"))
story.append(rule())
story.append(p("All 27 golden screens are reproduced below at legible size, in the order an owner and a reviewer actually meet them. Read each pair left to right. The caption states what to look at and what it proves to a CA. Screens are evidence, not mockups — layout, wording and figures are the app&apos;s.", "body"))

FLOW_SCREENS = [
    ("A — First run and migration", [
        ("01_welcome.png", "01 — Welcome", "First promise. No accounting jargon; one chat as the entry point. Sets the tone the CA will hold the product to: the owner talks, the engine posts."),
        ("02_where_are_your_books.png", "02 — Where are your books?", "Migration triage. Tally, Zoho, another app, spreadsheet, paper/CA, or fresh. Each path offers only the imports the server can parse — Vyapar / Khatabook / free-form sheets are not claimed."),
        ("03_business.png", "03 — Business", "Business identity before anything can post. Name and GSTIN with state and PAN derived; nothing posts until the business is named. Sample books load only via seed_demo."),
        ("04_bring_books_across.png", "04 — Bring books across", "What each source accepts. Day Book CSV, TallyPrime XML, Zoho invoice CSV, bank statement. Direct parsers for other apps are not built — stated openly."),
        ("05b_business.png", "05b — Business menu", "Firm surface on the phone: business, people, connections, lock. Owner-only connectors and roles live here; keys go straight to the API encrypted and return only as \u201cset\u201d."),
        ("05c_home_first_day.png", "05c — Home, first day", "Empty state done honestly. No invented opening balances; the Monday brief, dues and exceptions appear once there are books."),
        ("05_home.png", "05 — Home with books", "The dashboard. Cash and runway, sales deltas, receivable buckets, dues, exceptions, and the one thing to do. Marketplace close and registration-scoped taxes surface here for D2C businesses."),
    ]),
    ("B — Recording a sale: preview, then post", [
        ("06_new_entry.png", "06 — New entry", "One composer for every voucher type. The owner describes the sale once; the entry is tagged to the right head by the engine, not by the owner."),
        ("07_who_did_you_sell_to.png", "07 — Who did you sell to?", "Counterparty as a first-class step. Customer threads group every entry; GSTIN presence here decides the later B2B / B2CS split."),
        ("08_sales.png", "08 — Sales register", "Sales as a register, not a spreadsheet. Every line is a posted invoice that the trial balance and GSTR-1 will project — drillable to its thread."),
        ("09_new_sale.png", "09 — New sale", "Structured arguments, not free typing into the ledger. Quantity, rate, GST rate from the dated rules; the rate is never assumed and must be in force."),
        ("10_not_posted_yet.png", "10 — Not posted yet", "The control CAs ask for: a held proposal. The preview shows exactly what will post; questions and negations post nothing; the file is referenced by hash, never embedded."),
        ("11_posted.png", "11 — Posted", "Confirmation with an id. AR, sales and CGST/SGST or IGST posted in paise; overpayment rejected; partial and paid states tracked. The entry now appears in its thread and the dashboard."),
    ]),
    ("C — Taxes and the invoice as proof", [
        ("12_taxes.png", "12 — Taxes", "Taxes as a register alongside sales and purchases. Return tables, 2B position, deadlines and the filing pack live here — all projected from the same invoices."),
        ("13_customer_chat.png", "13 — Customer thread", "One thread per customer. Entries, previews, reminders and the invoice share one chronology, so a reviewer can reconstruct any balance without leaving the screen."),
        ("14_invoice.png", "14 — Invoice", "The source of truth rendered. Colour, bank details, terms, HSN column and signatory per the invoice design; printable and PDF from desktop and phone. Every GSTR row traces to this id."),
    ]),
    ("D — Expenses without double-posting", [
        ("15_expenses.png", "15 — Expenses", "Purchases and expenses as their own register. Heads, TDS sections and document state travel with each entry for audit and 3CD."),
        ("16_expense_head.png", "16 — Expense head", "Tagging to the right head. The model may propose a head for unseen wording — shown as the model\u2019s and changeable — never a figure."),
        ("17_expense_preview.png", "17 — Expense preview", "Preview before post, again. A photographed receipt within 50 paise and 3 days of a posted bill is offered as an attachment to that entry, so nothing posts twice."),
    ]),
    ("E — Corrections and maker-checker review", [
        ("18_credit_note_sheet.png", "18 — Credit note sheet", "Corrections start here, not by editing. A wrong invoice is cancelled or reduced by a credit note; the original stays in the journal."),
        ("19_credit_note_preview.png", "19 — Credit note preview", "Credit-note preview with both-side 2B handling. The ledger stays append-only; the pack shows the linkage a reviewer will ask for."),
        ("20_review_sales.png", "20 — Review sales", "Review queue. Dated rules, held invoices, blocked or reversible credit, 2B mismatches and overdue returns become queued items with severity, money at risk and evidence."),
        ("21_review_approve.png", "21 — Review and approve", "Maker-checker in the product. Approve binds to a draft hash with open items noted; a waiver needs a reason, is audited, and survives the next refresh."),
        ("22_credit_at_risk.png", "22 — Credit at risk", "Why Rule 37 / 37A are separate checks. 180-day non-payment and supplier-3B-not-filed are shown as distinct states, and say so when payment or filing data is missing."),
    ]),
    ("F — Books check, cash and quote", [
        ("23_books_check.png", "23 — Books check", "Month close with sign-off. Nine checks for a finished month (entries, duplicates, documents, settlements, 2B, payroll, bank reading, open items, month-on-month moves), narrative from figures, lock through month-end."),
        ("24_cash.png", "24 — Cash", "Cash with confidence, not a single number. Per-customer timing bands, 30/60/90-day low-expected-high, MSMED pay-by dates, salaries / PF / ESI / TDS outgoings, named risks; \u201cwho to pay\u201d and \u201ccan I make payroll\u201d answered by amount."),
        ("25_quote.png", "25 — Quote", "Quote before invoice. Created by message, sent by email or WhatsApp, converted without retyping — the same preview-and-confirm discipline as a sale."),
    ]),
]

def screen_block(fname, title, desc):
    path = os.path.join(SCREEN_DIR, fname)
    try:
        img = Image(path, width=82*mm, height=173*mm)
        img.hAlign = "CENTER"
    except Exception:
        img = Paragraph(f"[missing image: {fname}]", styles["body"])
    cap = [Paragraph(title, styles["caption"]), Paragraph(desc, styles["caption_body"])]
    return [img, cap]

for flow_title, items in FLOW_SCREENS:
    story.append(p(flow_title, "h2"))
    # render in pairs
    for i in range(0, len(items), 2):
        pair = items[i:i+2]
        row_imgs = []
        row_caps = []
        for fname, title, desc in pair:
            path = os.path.join(SCREEN_DIR, fname)
            try:
                img = Image(path, width=78*mm, height=164*mm)
                img.hAlign = "CENTER"
            except Exception:
                img = Paragraph(f"[missing image: {fname}]", styles["body"])
            row_imgs.append(img)
            box_data = [[Paragraph(f"<b>{title}</b>", styles["caption"])], [Paragraph(desc, styles["caption_body"])]]
            box = Table(box_data, colWidths=[78*mm])
            box.setStyle(TableStyle([
                ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("TOPPADDING", (0,0), (-1,-1), 1),
                ("BOTTOMPADDING", (0,0), (-1,-1), 1),
                ("LEFTPADDING", (0,0), (-1,-1), 2),
                ("RIGHTPADDING", (0,0), (-1,-1), 2),
            ]))
            row_caps.append(box)
        if len(pair) == 1:
            t = Table([[row_imgs[0]], [row_caps[0]]], colWidths=[170*mm])
        else:
            t = Table([row_imgs, row_caps], colWidths=[85*mm, 85*mm])
        t.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING", (0,0), (-1,-1), 4),
            ("RIGHTPADDING", (0,0), (-1,-1), 4),
            ("BOX", (0,0), (-1,-1), 0.5, LINE),
            ("BACKGROUND", (0,0), (-1,-1), colors.white),
        ]))
        story.append(t)
        story.append(Spacer(1, 3*mm))

# ---------- SECTION 4 ----------
story.append(p("4 &nbsp; What is verified, what is not, and open questions", "h1"))
story.append(rule())
story.append(p("Verified (can be shown live)", "h2"))
story.append(styled_table(["Area", "Evidence"],
    [
        ["Ledger", "Double-entry in paise, checksum chain, idempotent ids, linked bundles, trial balance that ties."],
        ["GST prep", "GSTR-1 tables + offline JSON with B2B / B2CL / B2CS split, bad rows held with reasons; 3B draft; filing pack."],
        ["Recon", "2B per tax head, credit notes both ways, s.16(2)(aa), Rule 37 / 37A separately, 1-vs-3B, IMS snapshot."],
        ["Deadlines & tax", "Holiday-aware dues, ITR old-vs-new from 65 golden cases, TDS 194A/C/I/J monitor."],
        ["Imports", "Tally CSV + XML, Zoho CSV, bank CSV / fixed-width / PDF with tie-out; row isolation, no silent mapping."],
        ["Audit", "Full-population rules, SA 230 papers, sampling, Schedule III / CARO / 3CD, risk scoring."],
        ["Controls", "Approvals, period lock, audit log, vault, content-addressed docs, loopback-only server."],
    ], [38*mm, 132*mm]))
story.append(p("Not yet live (do not demo as done)", "h2"))
story.append(bullet("No production GSTN filing, no MCA21, no payroll statutory. Sandbox TEST verified; production needs GSP onboarding, real keys and the live switch."))
story.append(bullet("No deployed backend, no Play / App Store listing submitted, iOS built unsigned in CI only, no iOS share extension."))
story.append(bullet("Direct import from Vyapar, Khatabook, Busy, Marg or free-form sheets is not built; the server has no parser for them."))
story.append(bullet("Custom domain + TLS, branch protection and code-signing certificate remain ops items; penetration test and counsel sign-off on retention are open."))
story.append(p("Open questions for agenda 3", "h2"))
story.append(bullet("1. What would stop you trusting this with a live client — evidence, wording, or a missing control?"))
story.append(bullet("2. Which two reports or exports would you demand before signing a month — and in what format?"))
story.append(bullet("3. Who in the firm may approve a filing, and should approval bind to the payload hash as it does today?"))
story.append(bullet("4. Pilot terms: one client, one month, read-only first — acceptable? What acknowledgement do you need in chat?"))
story.append(Spacer(1, 6*mm))
story.append(rule())
story.append(p("Prepared from STATUS.md, platform CA-REVIEW, mobile README and the 27 golden screens. Figures are the test counts, not marketing. Gaps are stated where the build stops.", "body"))

# ---------- BUILD ----------
def footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawCentredString(A4[0]/2, 12*mm, "MyCA — Confidential — CA Review 30 Oct 2026")
        canvas.drawRightString(A4[0] - 18*mm, 12*mm, f"{doc.page}")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(18*mm, 14*mm, A4[0]-18*mm, 14*mm)
    canvas.restoreState()

def cover_footer(canvas, doc):
    canvas.saveState()
    if doc.page == 1:
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawCentredString(A4[0]/2, 12*mm, "MyCA — Confidential — CA Review 30 Oct 2026  ·  p. 1")
    canvas.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=18*mm,
    title="MyCA Product Guide for CA Review", author="MyCA")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])

doc.build(story)
print(f"Wrote {OUT}")
