// index.mjs — public entry point for Sprint 2: bank statement ingestion.
//
//   ingest({ type: 'csv', content })            — bank CSV export
//   ingest({ type: 'matrix', rows: [...] })     — XLSX bridge
//   ingest({ type: 'text', content })           — fixed-width TXT statement (HDFC/ICICI/SBI)
//   ingestPdf(bytes, { ocrEngine, ...opts })    — PDF (digital text layer OR ocrEngine)
//
// Result shape mirrors Sprint 1 so the UI/benchmark layers are drop-in.

import { COLUMN_ALIASES } from './schema.mjs';
import { parseCSV, fromMatrix, parseFixedWidth, buildColumnMap } from './parse.mjs';
import { validateFileStructure, validateRow } from './validate.mjs';
import { buildCanonicalRow, rollBalances, buildReport } from './normalize.mjs';
import { extractPdfText, textToLines } from './ocr.mjs';
import { parseFixedWidth as parseFixedWidthLines } from './parse.mjs';

const FIXED_WIDTH_HEADER = ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance', 'Ref No'];

export function ingest(input, opts = {}) {
  const t0 = performance.now();
  const asOfDate = opts.asOfDate || todayISO();
  const clientRef = opts.clientRef || null;
  const fileLabel = opts.fileLabel || input.fileName || `${input.type}-input`;

  let rawRows;
  if (input.type === 'csv') {
    rawRows = parseCSV(input.content);
  } else if (input.type === 'matrix') {
    rawRows = fromMatrix(input.rows);
  } else if (input.type === 'text') {
    rawRows = fromFixedWidth(parseFixedWidthLines(input.content));
  } else {
    throw new Error(`ingest: unsupported input type "${input.type}" (expected "csv", "matrix" or "text").`);
  }

  if (!rawRows.length) {
    const issues = [{
      code: 'EMPTY_FILE', severity: 'error', row: 0, field: null,
      message: 'File is empty or contains no data rows.'
    }];
    return finish(issues, [], asOfDate, clientRef, fileLabel, 0, t0);
  }

  // Header detection: first row with >=2 cells matching known aliases.
  let headerIndex = -1;
  outer:
  for (let i = 0; i < rawRows.length; i++) {
    let recognized = 0;
    for (const cell of rawRows[i]) {
      const n = String(cell).trim().toLowerCase();
      for (const aliases of Object.values(COLUMN_ALIASES)) {
        if (aliases.some((a) => a.toLowerCase() === n)) { recognized++; break; }
      }
    }
    if (recognized >= 2) { headerIndex = i; break outer; }
  }

  if (headerIndex === -1) {
    const issues = [{
      code: 'NO_HEADER_ROW', severity: 'error', row: 1, field: null,
      message: input.type === 'text'
        ? 'Could not detect a statement header row (expected Date + Narration + Withdrawal/Deposit/Balance).'
        : 'Could not detect a header row with recognizable bank statement columns.'
    }];
    return finish(issues, [], asOfDate, clientRef, fileLabel, rawRows.length, t0);
  }

  const headerRow = rawRows[headerIndex];
  const { map, unknownColumns } = buildColumnMap(headerRow, COLUMN_ALIASES);

  const fileIssues = [];
  for (const u of unknownColumns) {
    fileIssues.push({
      code: 'UNKNOWN_COLUMN', severity: 'warning', row: headerIndex + 1, field: null,
      message: `Column "${u.header}" (col ${u.colIndex + 1}) is not recognized and will be ignored.`
    });
  }
  validateFileStructure(rawRows, map, fileIssues);

  const dataRows = rawRows.slice(headerIndex + 1).filter((r) => r.some((c) => String(c).trim() !== ''));
  const sourceRowCount = headerIndex + 1 + dataRows.length;

  const rolled = rollBalances(dataRows, map);
  const rowIssues = [];
  const canonical = [];
  for (let i = 0; i < rolled.length; i++) {
    const { row, prevBalance } = rolled[i];
    const rowIssuesForThis = validateRow(dataRows, i, map, asOfDate, prevBalance);
    rowIssues.push(...rowIssuesForThis);
    canonical.push(buildCanonicalRow(row, map, i, rowIssuesForThis, prevBalance, asOfDate));
  }

  const allIssues = [...fileIssues, ...rowIssues];
  return finish(allIssues, canonical, asOfDate, clientRef, fileLabel, sourceRowCount, t0, {
    ingestShape: { source: input.type, headerRow }
  });
}

// PDF path (may require an async OCR adapter for scans).
export async function ingestPdf(bytes, opts = {}) {
  const t0 = performance.now();
  const asOfDate = opts.asOfDate || todayISO();
  const clientRef = opts.clientRef || null;
  const fileLabel = opts.fileLabel || 'pdf-statement';

  const res = extractPdfText(bytes);
  if (!res.ok) {
    if (res.error === 'NOT_A_PDF') {
      return finish([{
        code: 'NOT_A_PDF', severity: 'error', row: 0, field: null,
        message: 'File does not start with %PDF — not a PDF document.'
      }], [], asOfDate, clientRef, fileLabel, 0, t0);
    }
    if (res.error === 'NO_TEXT_LAYER') {
      if (opts.ocrEngine && typeof opts.ocrEngine === 'function') {
        // async ocr(buffer) -> { text } — adapter contract in ocr.mjs
        let ocrText;
        try {
          const out = await opts.ocrEngine(bytes);
          ocrText = (out && out.text) || '';
        } catch (e) {
          return finish([{
            code: 'OCR_FAILED', severity: 'error', row: 0, field: null,
            message: `OCR engine failed: ${e.message}`
          }], [], asOfDate, clientRef, fileLabel, 0, t0);
        }
        if (!String(ocrText).trim()) {
          return finish([{
            code: 'OCR_NO_TEXT', severity: 'error', row: 0, field: null,
            message: 'OCR engine returned no text.'
          }], [], asOfDate, clientRef, fileLabel, 0, t0);
        }
        return ingest({ type: 'text', content: ocrText }, { ...opts, fileLabel });
      }
      return finish([{
        code: 'SCANNED_PDF_NEEDS_OCR', severity: 'error', row: 0, field: null,
        message: 'PDF has no embedded text layer (scanned image). Supply an ocrEngine that satisfies the adapter contract to extract rows.'
      }], [], asOfDate, clientRef, fileLabel, 0, t0);
    }
    return finish([{
      code: 'PDF_PARSE_FAILED', severity: 'error', row: 0, field: null,
      message: `Could not extract text from PDF: ${res.error}.`
    }], [], asOfDate, clientRef, fileLabel, 0, t0);
  }

  const lines = stripPageNumbersFrom(textToLines(res.text));
  const textResult = ingest({ type: 'text', content: lines.join('\n') }, { ...opts, fileLabel });
  if (textResult.ok || textResult.errors.length) {
    return { ...textResult, pdfTokens: res.tokens };
  }
  return { ...textResult, pdfTokens: res.tokens };
}

function stripPageNumbersFrom(lines) {
  return lines
    .map((l) => l.replace(/\bpage\s*\d+(?:\s+of\s+\d+)?\b/gi, ''))
    .filter((l) => l.trim() !== '' && !/^[-_=]{2,}$/.test(l.trim()));
}

function fromFixedWidth(objectRows) {
  const head = FIXED_WIDTH_HEADER;
  const matrix = [head];
  for (const r of objectRows) {
    matrix.push([r.date, r.narration, r.withdrawal, r.deposit, r.balance, r.ref]);
  }
  return fromMatrix(matrix);
}

// ---- helpers ----------------------------------------------------------------

function finish(issues, rows, asOfDate, clientRef, fileLabel, sourceRows, t0, extra = {}) {
  const report = buildReport({
    fileLabel, clientRef, asOfDate, sourceRows, issues, rows
  });
  report.durationMs = Math.round((performance.now() - t0) * 10) / 10;
  return {
    ok: report.ok,
    issues,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
    rows,
    report,
    ...extra
  };
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export { parseAmount, parseDate } from './validate.mjs';
export { parseCSV, fromMatrix, parseFixedWidth, buildColumnMap } from './parse.mjs';
export { COLUMN_ALIASES } from './schema.mjs';
export { classify, RULES } from './classify.mjs';
export { extractPdfText, textToLines, needsOcr } from './ocr.mjs';