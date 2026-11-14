import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import 'api/models.dart';
import 'format.dart';

const invoiceFontRegular = 'assets/fonts/Inter-Regular.ttf';
const invoiceFontBold = 'assets/fonts/Inter-SemiBold.ttf';

const _ink = PdfColor.fromInt(0xFF15181B);
const _muted = PdfColor.fromInt(0xFF6B6F76);
const _line = PdfColor.fromInt(0xFFD9D6CE);

String invoiceFileName(InvoiceDocument doc) => '${doc.id}.pdf';

Future<Uint8List> buildInvoicePdf(
  InvoiceDocument doc, {
  required ByteData regular,
  required ByteData bold,
}) {
  final base = pw.Font.ttf(regular);
  final strong = pw.Font.ttf(bold);
  final design = doc.template;
  final accent = PdfColor.fromInt(design.accent);
  final showHsn = design.showHsn && !doc.isUs;
  final body = pw.TextStyle(font: base, fontSize: 9.5, color: _ink);
  final small = pw.TextStyle(font: base, fontSize: 8.5, color: _muted);
  final label = pw.TextStyle(
    font: strong,
    fontSize: 7.5,
    color: _muted,
    letterSpacing: 0.8,
  );
  final heavy = pw.TextStyle(font: strong, fontSize: 9.5, color: _ink);

  pw.Widget cell(
    String text, {
    pw.TextStyle? style,
    pw.Alignment align = pw.Alignment.centerLeft,
  }) => pw.Container(
    alignment: align,
    padding: const pw.EdgeInsets.symmetric(vertical: 6, horizontal: 4),
    child: pw.Text(text, style: style ?? body),
  );

  pw.Widget amountRow(String name, num amount, {bool strongRow = false}) =>
      pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 2.5),
        child: pw.Row(
          children: [
            pw.Expanded(child: pw.Text(name, style: strongRow ? heavy : body)),
            pw.Text(
              rupees(amount),
              style: strongRow ? heavy.copyWith(fontSize: 12) : body,
            ),
          ],
        ),
      );

  const right = pw.Alignment.centerRight;
  final document = pw.Document(
    title: '${doc.title} ${doc.id}',
    author: doc.sellerName,
  );
  document.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(40),
      build: (context) => [
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    doc.sellerName,
                    style: pw.TextStyle(
                      font: strong,
                      fontSize: 16,
                      color: design.minimal ? _ink : accent,
                    ),
                  ),
                  if (doc.sellerAddress.isNotEmpty)
                    pw.Text(doc.sellerAddress, style: small),
                  if (doc.sellerState.label.isNotEmpty)
                    pw.Text(doc.sellerState.label, style: small),
                  if (doc.sellerGstin.isNotEmpty)
                    pw.Text('GSTIN ${doc.sellerGstin}', style: body),
                ],
              ),
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: [
                pw.Text(
                  doc.title.toUpperCase(),
                  style: label.copyWith(fontSize: 9, color: accent),
                ),
                pw.SizedBox(height: 2),
                pw.Text(
                  doc.id,
                  style: pw.TextStyle(font: strong, fontSize: 14, color: _ink),
                ),
                pw.Text(longDate(doc.date), style: body),
                if (doc.isQuote && doc.validUntil.isNotEmpty) pw.Text('Valid until ${longDate(doc.validUntil)}', style: small),
                if (doc.dueDate.isNotEmpty)
                  pw.Text(
                    'Due ${longDate(doc.dueDate)} (${termsLabel(doc.termsDays)})',
                    style: small,
                  ),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 18),
        pw.Divider(color: design.minimal ? _line : accent, thickness: design.minimal ? 0.6 : 1.2),
        pw.SizedBox(height: 10),
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(doc.isQuote ? 'QUOTED TO' : 'BILL TO', style: label),
                  pw.SizedBox(height: 3),
                  pw.Text(doc.buyerName, style: heavy),
                  if (doc.buyerAddress.isNotEmpty)
                    pw.Text(doc.buyerAddress, style: small),
                  if (doc.buyerGstin.isNotEmpty)
                    pw.Text('GSTIN ${doc.buyerGstin}', style: body),
                  if (doc.ewayBill?.ewbNo.isNotEmpty ?? false)
                    pw.Text('E-way bill ${doc.ewayBill!.ewbNo}', style: body),
                ],
              ),
            ),
            if (doc.placeOfSupply.label.isNotEmpty)
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text('PLACE OF SUPPLY', style: label),
                  pw.SizedBox(height: 3),
                  pw.Text(doc.placeOfSupply.label, style: body),
                ],
              ),
          ],
        ),
        if (doc.statutoryLines.isNotEmpty) ...[
          pw.SizedBox(height: 10),
          for (final line in doc.statutoryLines) pw.Text(line, style: body),
        ],
        if (!doc.isQuote && (doc.einvoice?.onPdf ?? false)) ...[
          pw.SizedBox(height: 12),
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              if (doc.einvoice!.signedQrCode.isNotEmpty) ...[
                pw.BarcodeWidget(
                  barcode: pw.Barcode.qrCode(),
                  data: doc.einvoice!.signedQrCode,
                  width: 96,
                  height: 96,
                ),
                pw.SizedBox(width: 12),
              ],
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text('E-INVOICE', style: label),
                    pw.SizedBox(height: 3),
                    pw.Text('IRN ${doc.einvoice!.irn}', style: small),
                    if (doc.einvoice!.ackNo.isNotEmpty)
                      pw.Text('Ack No ${doc.einvoice!.ackNo}${doc.einvoice!.ackDate.isEmpty ? '' : '   Ack Date ${doc.einvoice!.ackDate}'}', style: small),
                    if (!doc.einvoice!.valid)
                      pw.Text('TEST IRN, NOT VALID FOR A REAL SUPPLY', style: heavy.copyWith(color: PdfColors.red700)),
                  ],
                ),
              ),
            ],
          ),
        ],
        pw.SizedBox(height: 18),
        pw.Table(
          border: const pw.TableBorder(
            horizontalInside: pw.BorderSide(color: _line, width: 0.5),
            bottom: pw.BorderSide(color: _line, width: 0.5),
          ),
          columnWidths: {
            0: const pw.FlexColumnWidth(5),
            1: pw.FlexColumnWidth(showHsn ? 1.6 : 0.01),
            2: const pw.FlexColumnWidth(1.2),
            3: const pw.FlexColumnWidth(2.2),
            4: const pw.FlexColumnWidth(2.4),
            5: const pw.FlexColumnWidth(1.2),
            6: const pw.FlexColumnWidth(2.6),
          },
          children: [
            pw.TableRow(
              children: [
                cell('ITEM', style: label),
                cell(showHsn ? 'HSN/SAC' : '', style: label),
                cell('QTY', style: label, align: right),
                cell('RATE', style: label, align: right),
                cell(doc.isUs ? 'SUBTOTAL' : 'TAXABLE', style: label, align: right),
                cell(doc.isUs ? 'TAX' : 'GST', style: label, align: right),
                cell('AMOUNT', style: label, align: right),
              ],
            ),
            for (final line in doc.lines)
              pw.TableRow(
                children: [
                  cell(line.description),
                  cell(showHsn ? line.hsn : ''),
                  cell(plainNumber(line.qty), align: right),
                  cell(rupees(line.rate), align: right),
                  cell(rupees(doc.isUs ? line.qty * line.rate : line.taxable), align: right),
                  cell(doc.isUs ? (line.taxRate > 0 ? '${plainNumber(line.taxRate)}%' : '-') : '${plainNumber(line.gstRate)}%', align: right),
                  cell(rupees(line.amount), align: right),
                ],
              ),
          ],
        ),
        pw.SizedBox(height: 14),
        pw.Row(
          children: [
            pw.Spacer(flex: 5),
            pw.Expanded(
              flex: 4,
              child: pw.Column(
                children: [
                  amountRow(doc.subtotalLabel, doc.taxable),
                  for (final (name, amount) in doc.taxHeads)
                    amountRow(name, amount),
                  pw.Divider(color: _line, thickness: 0.6),
                  amountRow('Total', doc.total, strongRow: true),
                  if (doc.received > 0) ...[
                    pw.SizedBox(height: 4),
                    amountRow('Received', doc.received),
                    amountRow('Balance', doc.balance),
                  ],
                ],
              ),
            ),
          ],
        ),
        if (design.bankWords.isNotEmpty && !doc.isQuote) ...[
          pw.SizedBox(height: 18),
          pw.Text('PAY TO', style: label),
          pw.SizedBox(height: 3),
          pw.Text(design.bankWords, style: body),
          if (doc.upiLink.isNotEmpty) ...[
            pw.SizedBox(height: 8),
            pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                pw.BarcodeWidget(
                  barcode: pw.Barcode.qrCode(),
                  data: doc.upiLink,
                  width: 84,
                  height: 84,
                ),
                pw.SizedBox(width: 10),
                pw.Text('Scan to pay ${rupees(doc.balance)}\nwith any UPI app', style: small),
              ],
            ),
          ],
        ],
        if (design.terms.isNotEmpty) ...[
          pw.SizedBox(height: 14),
          pw.Text('TERMS', style: label),
          pw.SizedBox(height: 3),
          pw.Text(design.terms, style: small),
        ],
        pw.SizedBox(height: 44),
        pw.Align(
          alignment: right,
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Text('For ${doc.sellerName}', style: body),
              pw.SizedBox(height: 34),
              pw.Text(
                design.signatory.isEmpty ? 'Authorised signatory' : design.signatory,
                style: design.signatory.isEmpty ? small : heavy,
              ),
              if (design.signatory.isNotEmpty) pw.Text('Authorised signatory', style: small),
            ],
          ),
        ),
        if (design.footer.isNotEmpty) ...[
          pw.SizedBox(height: 24),
          pw.Center(child: pw.Text(design.footer, style: small)),
        ],
      ],
    ),
  );
  return document.save();
}
