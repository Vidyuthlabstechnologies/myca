#!/usr/bin/env python3
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
    Spacer, Table, TableStyle, Image)
from reportlab.lib import colors

SCREEN_DIR = os.path.join("docs", "review", "windows-screens")
OUT = os.path.join("docs", "review", "MyCA-Windows-Guide.pdf")
NAVY = HexColor("#1B2A4A"); SLATE = HexColor("#334155"); MUTED = HexColor("#64748B")
LINE = HexColor("#CBD5E1")
styles = {
 "cover_title": ParagraphStyle("ct", fontName="Helvetica-Bold", fontSize=30, leading=34, textColor=NAVY, alignment=TA_LEFT),
 "cover_sub": ParagraphStyle("cs", fontName="Helvetica", fontSize=11, leading=15, textColor=SLATE, alignment=TA_LEFT),
 "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=17, textColor=NAVY, spaceBefore=14, spaceAfter=6, keepWithNext=True),
 "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=HexColor("#0F2A44"), spaceBefore=10, spaceAfter=4, keepWithNext=True),
 "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.3, leading=13.5, textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=4),
 "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.3, leading=13.5, textColor=SLATE, alignment=TA_LEFT, leftIndent=12, spaceAfter=2),
 "caption": ParagraphStyle("caption", fontName="Helvetica-Bold", fontSize=8.4, leading=10.5, textColor=NAVY, alignment=TA_LEFT, spaceAfter=1),
 "caption_body": ParagraphStyle("cb", fontName="Helvetica", fontSize=7.9, leading=10.5, textColor=SLATE, alignment=TA_LEFT),
 "table_cell": ParagraphStyle("tc", fontName="Helvetica", fontSize=8.2, leading=11, textColor=SLATE, alignment=TA_LEFT),
 "table_head": ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8.2, leading=11, textColor=white, alignment=TA_LEFT),
 "footer": ParagraphStyle("f", fontName="Helvetica", fontSize=7, leading=8, textColor=MUTED, alignment=TA_CENTER),
}
def p(t, s="body"): return Paragraph(t, styles[s])
def bullet(t): return Paragraph(t, styles["bullet"], bulletText="\u2022")
def styled_table(headers, rows, col_widths):
    data = [[Paragraph(h, styles["table_head"]) for h in headers]]
    for r in rows: data.append([Paragraph(c, styles["table_cell"]) for c in r])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, HexColor("#F8FAFC")]),("GRID",(0,0),(-1,-1),0.5,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6)]))
    return t
def rule():
    t = Table([[""]], colWidths=[170*mm]); t.setStyle(TableStyle([("LINEBELOW",(0,0),(-1,0),0.7,LINE)])); return t
story = []
story.append(Spacer(1, 22*mm)); story.append(p("MYCA", "cover_sub")); story.append(p("Windows Workbench Guide<br/>for CA Review", "cover_title")); story.append(Spacer(1, 4*mm))
story.append(p("The firm-side companion to the phone app: every tab of the Windows desktop, captured live with Nalanda Textiles LLP demo books, and what each proves to a reviewing CA.", "cover_sub")); story.append(Spacer(1, 6*mm)); story.append(rule()); story.append(Spacer(1, 5*mm))
story.append(styled_table(["",""],[["Date","30 October 2026 — live captures from http://127.0.0.1:4789 with seeded demo books (INV-0001, INV-0002, BILL-0001)"],["Sources","platform/desktop/renderer (12 tabs) + keys.html sandbox page"],["Verification","Trial balance Dr = Cr on screen &middot; Books tie &middot; FY 2026-27"],["Scope","Firm-side flow: vouchers to books to GST to approvals to govt to print"],["Classification","Confidential — for review discussion only"]],[32*mm,138*mm]))
story.append(Spacer(1,6*mm))
story.append(p("How to use this guide: walk tabs left to right. Vouchers is where postings land; Books proves they tie; GST proves the return comes from the same invoices; Documents / Clients / Approvals / Firm prove control; Govt / APIs / Sandbox keys prove integrations stay gated; Print proves the invoice leaves the machine cleanly. OSS and Tools prove what the product refuses to embed.", "body"))
story.append(p("1 &nbsp; The firm-side flow in one page", "h1")); story.append(rule())
story.append(p("The Windows app is the firm&apos;s book of record. The phone proposes; the desktop reviews, reconciles, approves and prints. One local server serves both: chat, tools and the journal in <font face=\"Helvetica-Bold\">platform/src</font>, state in state.json, document bytes content-addressed on disk. Live provider calls stay off unless MYCA_ENABLE_LIVE_CALLS=1, and gated operations need a CA approval bound to the exact payload.", "body"))
story.append(styled_table(["Stage","Tab","CA question answered"],[["Post","Vouchers","Do invoices and bills land with party, GSTIN, date, amount and status — paid, posted, or held — in one folio?"],["Tie","Books","Do debit and credit tie, account by account, with the checksum intact?"],["Return","GST","Do B2B / B2CL / B2CS, ITC and payable come from the same invoices, held back with reasons where unreportable?"],["Evidence","Documents","Is every bill filed against the active client and retrievable byte-identical?"],["Scope","Clients","Whose books are these, and does switching isolate the ledger?"],["Control","Approvals","Who authorised a live operation, and is maker-checker enforced?"],["Identity","Firm","Whose GSTIN / PAN / state is the book, and can history be rewritten? (It cannot.)"],["Portal","Govt","Can this PC reach NIC/GSTN, and are credentials encrypted with the public key loaded?"],["Readiness","APIs","Which of REQ-CA-001…015 is connected, and what is honestly missing?"],["Output","Print","Does the invoice print and save as PDF with bank details, HSN and signatory?"],["Honesty","OSS","What is referenced, reimplemented or refused to embed — and under which licence?"],["Power","Tools","Which named tools exist, and which are blocked from the assistant?"]],[22*mm,28*mm,120*mm]))
SCREENS = [
 ("01-vouchers.png","01 — Vouchers","The folio. INV-0002, BILL-0001 and INV-0001 (PAID) with party GSTINs and amounts; the strip below books a voucher; chat holds previews. Proves postings are visible, searchable and statused."),
 ("02-books.png","02 — Books","Chart of accounts with debit and credit columns and the tie line. Proves Dr = Cr from the same transfers that the vouchers show — ask for trial balance and read it here."),
 ("03-gst.png","03 — GST","Return workspace: metrics, GSTR-1 download, purchase bills and ITC beside output tables. Proves the return is a projection of posted invoices, not a retyped form."),
 ("04-documents.png","04 — Documents","File against the active client, list what is on file, download it back. Bytes are content-addressed and re-verified; state.json holds metadata only."),
 ("05-clients.png","05 — Clients","Registry and active-book switcher. Each client gets isolated books; SELF is the firm&apos;s own. Proves multi-client practice without mingling ledgers."),
 ("06-approvals.png","06 — Approvals","Request, review, approve or reject gated operations. Maker-checker, reviewer roles, 24-hour expiry, single use. The control CAs sign against."),
 ("07-firm.png","07 — Firm","Business profile (name, GSTIN, PAN, state, FY, entity), data path, backup / restore of every book and the audit trail, outbox. Changing identity affects future postings only."),
 ("08-govt.png","08 — Govt","NIC e-invoice on-boarding in six steps: portal registration, credentials, public key, save, auth then IRN, production separated. Refuses to authenticate without the .cer."),
 ("09-apis.png","09 — APIs","Integration readiness REQ-CA-001…015: connected count, must-have missing, next step; Sandbox by Quicko as provider adapters with engines as source of truth."),
 ("10-print.png","10 — Print","Invoice output: print, Save as PDF through the narrow preload bridge, WhatsApp and email share from this PC. Colour, bank details, terms, HSN, signatory."),
 ("11-oss.png","11 — OSS","Licence honesty table: what is referenced, reimplemented or refused to embed (GPL / AGPL / O&apos;Saasy never copied into the ledger runtime)."),
 ("12-tools.png","12 — Tools","Named-tool catalogue with risk classes. Writes, credentials and approval decisions are blocked from the assistant; the chat may only choose, never compute."),
 ("13-sandbox-keys.png","13 — Sandbox keys","Keys beside the desktop: Quicko TEST vs LIVE with reachable check, and NIC sandbox credentials. Saved encrypted in the local vault; .env wins when set."),
]
story.append(p("2 &nbsp; Every tab, captured live", "h1")); story.append(rule())
story.append(p("Screenshots are 1440 &times; 900 captures of the running desktop with the seeded firm. Read each caption for what to point at in the room.", "body"))
for fname, title, desc in SCREENS:
    path = os.path.join(SCREEN_DIR, fname)
    try: img = Image(path, width=150*mm, height=93.75*mm)
    except Exception: img = Paragraph(f"[missing: {fname}]", styles["body"])
    img.hAlign = "CENTER"
    t = Table([[img],[Paragraph(f"<b>{title}</b>", styles["caption"])],[Paragraph(desc, styles["caption_body"])]], colWidths=[170*mm])
    t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),("BOX",(0,0),(-1,-1),0.5,LINE),("BACKGROUND",(0,0),(-1,-1),colors.white)]))
    story.append(t); story.append(Spacer(1,3*mm))
story.append(p("3 &nbsp; What to say when they push", "h1")); story.append(rule())
story.append(bullet("<b>Filing?</b> Prepared here, filed only with the live switch plus a bound approval; the acknowledgement returns to chat. No silent filing path exists."))
story.append(bullet("<b>GSP?</b> MyCA is not a GSP. Sandbox paths are verified in TEST; production needs on-boarding, static IPs and real keys."))
story.append(bullet("<b>Tally / Zoho?</b> Imports land without silent mapping; Tally push on this machine and Zoho push are gated writes. The ledger of record stays MyCA&apos;s journal."))
story.append(bullet("<b>AI figures?</b> The assistant chooses tools; every amount comes from a deterministic engine with act, section and dated validity."))
story.append(Spacer(1,6*mm)); story.append(rule())
story.append(p("Built from live captures on 30 Oct 2026 with seeded Nalanda Textiles LLP books. Figures are the demo books&apos;, not marketing.", "body"))
def footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont("Helvetica",7); canvas.setFillColor(MUTED)
        canvas.drawCentredString(A4[0]/2,12*mm,"MyCA — Confidential — CA Review 30 Oct 2026 — Windows")
        canvas.drawRightString(A4[0]-18*mm,12*mm,f"{doc.page}")
        canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5); canvas.line(18*mm,14*mm,A4[0]-18*mm,14*mm)
    canvas.restoreState()
doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=18*mm, title="MyCA Windows Guide for CA Review", author="MyCA")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])
doc.build(story)
print(f"Wrote {OUT}")
