// index.mjs
// Public entry point for Sprint 1: Tally Day Book ingestion + schema validation.
//
//   ingest({ type: 'csv', content })          -> parse CSV text
//   ingest({ type: 'matrix', rows: [...] })   -> parse a 2-D array (XLSX bridge later)
//
// Returns an IngestionResult:
//   { ok, issues, errors, warnings, rows, report }

import { COLUMN_ALIASES } from './schema.mjs';
import { parseCSV, fromMatrix, buildColumnMap } from './parse.mjs';
import { validateFileStructure, validateRow, parseDate } from './validate.mjs';
import { buildCanonicalRow, buildReport } from './normalize.mjs';

export function ingest(input, opts = {}) {
  const t0 = performance.now();
  const asOfDate = opts.asOfDate || todayISO();
  const clientRef = opts.clientRef || null;
  const fileLabel = opts.fileLabel || input.fileName || (input.type === 'csv' ? 'csv-input' : 'matrix-input');

  let rows;
  if (input.type === 'csv') {
    rows = parseCSV(input.content);
  } else if (input.type === 'matrix') {
    rows = fromMatrix(input.rows);
  } else {
    throw new Error(`ingest: unsupported input type "${input.type}" (expected "csv" or "matrix").`);
  }

  if (!rows.length) {
    const issues = [{
      code: 'EMPTY_FILE', severity: 'error', row: 0, field: null,
      message: 'File is empty or contains no data rows.'
    }];
    return finish(issues, [], asOfDate, clientRef, fileLabel, 0, t0);
  }

  // Header detection: first row with >=2 cells matching known aliases.
  let headerIndex = -1;
  outer:
  for (let i = 0; i < rows.length; i++) {
    let recognized = 0;
    for (const cell of rows[i]) {
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
      message: 'Could not detect a header row with recognizable Tally Day Book columns.'
    }];
    return finish(issues, [], asOfDate, clientRef, fileLabel, rows.length, t0);
  }

  const headerRow = rows[headerIndex];
  const { map, unknownColumns } = buildColumnMap(headerRow, COLUMN_ALIASES);

  // File-level issues.
  const fileIssues = [];
  for (const u of unknownColumns) {
    fileIssues.push({
      code: 'UNKNOWN_COLUMN', severity: 'warning', row: headerIndex + 1, field: null,
      message: `Column "${u.header}" (col ${u.colIndex + 1}) is not recognized and will be ignored.`
    });
  }
  validateFileStructure(rows, map, fileIssues);

  // Data rows: everything after the header, dropping fully-blank lines.
  const dataRows = rows.slice(headerIndex + 1).filter((r) => r.some((c) => String(c).trim() !== ''));
  const sourceRowCount = headerIndex + 1 + dataRows.length;

  const rowIssues = [];
  const canonical = [];
  const seen = new Set();
  for (let i = 0; i < dataRows.length; i++) {
    const rowIssuesForThis = validateRow(dataRows, i, map, asOfDate, seen);
    rowIssues.push(...rowIssuesForThis);
    canonical.push(buildCanonicalRow(dataRows[i], map, i, rowIssuesForThis, asOfDate));
  }

  const allIssues = [...fileIssues, ...rowIssues];
  return finish(allIssues, canonical, asOfDate, clientRef, fileLabel, sourceRowCount, t0, {
    ingestShape: { headerRow, map }
  });
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

export function isValidDate(raw, asOfDate) {
  return parseDate(raw, asOfDate).ok;
}

export { parseAmount, normalizeGstin, normalizeHsn, normalizeTdsSection } from './validate.mjs';
export { parseCSV, fromMatrix, buildColumnMap } from './parse.mjs';
export { COLUMN_ALIASES, KNOWN_TDS_SECTIONS, GSTIN_PATTERN, HSN_PATTERN } from './schema.mjs';