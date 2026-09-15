// ocr.mjs
// PDF -> statement pipeline for Sprint 2.
//
// Two realities for "PDF/scan OCR extraction":
//   1. DIGITAL PDFs  — have a text layer. We extract it natively (no deps).
//   2. SCANNED PDFs  — images only. We can't OCR without an engine.
//
// Design decision (mirrors "reject with a specific error"):
//   OCR is a PLUGGABLE ADAPTER, not a forbidden dependency. We ship the
//   contract + a fast native path (text-layer). Scanned files need the caller
//   to supply an `ocrEngine` matching the interface below. If missing we return
//   a precise error (SCANNED_PDF_NEEDS_OCR) instead of silently guessing.

// --- Native text-layer extraction -------------------------------------------
// Minimal but correct for the majority of Tally/portal/software-generated PDFs
// (Helvetica-style, uncompressed). Tokens stream to a lines[] of strings.
export function extractPdfText(pdfBytes) {
  if (!pdfBytes || pdfBytes.length < 5 || pdfBytes.toString('utf8', 0, 5) !== '%PDF-') {
    return { ok: false, error: 'NOT_A_PDF', text: null };
  }

  const s = pdfBytes.toString('utf8');
  const lines = [];
  let line = '';
  let lastAbsY = null;

  // Walk content operators in document order so we can reconstruct LINES.
  //   (...) Tj / [...] TJ   -> text on the current line
  //   x y Td / x y TD       -> relative move; vertical component = new line
  //   a b c d e f Tm        -> absolute positioning; changed y = new line
  //   T*                    -> explicit line feed
  const ops = /\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\]])*)\]\s*TJ|(-?[\d.]+)\s+(-?[\d.]+)\s+T[dD]|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|T\*/g;
  let m;
  while ((m = ops.exec(s))) {
    if (m[1] != null || m[2] != null) {
      // text token
      let tok;
      if (m[1] != null) {
        tok = m[1];
      } else {
        const frag = m[2].match(/\(((?:[^()\\]|\\.)*)\)/g) || [];
        tok = frag.map((f) => f.slice(1, -1)).join(' ');
      }
      if (line) line += ' ';
      line += tok;
    } else if (m[3] != null) {
      // relative Td/TD
      const ty = Number(m[4]);
      if (Math.abs(ty) > 0.01) {
        if (line) { lines.push(line.trim()); line = ''; }
      }
    } else if (m[5] != null) {
      // absolute Tm — new baseline when y changes
      const absY = Number(m[10]);
      if (lastAbsY != null && Math.abs(absY - lastAbsY) > 0.01) {
        if (line) { lines.push(line.trim()); line = ''; }
      }
      lastAbsY = absY;
    } else {
      // T* line feed
      if (line) { lines.push(line.trim()); line = ''; }
    }
  }
  if (line) lines.push(line.trim());

  if (!lines.length) {
    return { ok: false, error: 'NO_TEXT_LAYER', text: null };
  }

  const text = lines.join('\n');
  return { ok: true, error: null, text, tokens: lines };
}

// Standardized OCR adapter contract.
// async ocr(pdfBuffer) -> Promise<{ text }>  — raw extracted/recognised text.
export const OCR_ADAPTER = Symbol('ocrAdapter');

export function needsOcr(result) {
  return !result.ok && result.error === 'NO_TEXT_LAYER';
}

// Take extracted text and turn it into statement rows where headers exist.
// If the PDF is a digital text export this is a trivial rename; if it came
// from OCR the rows still flow through the same canonicalizer in index.mjs.
export function stripPageNumbers(lines) {
  return lines
    .map((l) => l.replace(/\bPage\s*\d+(?: of \d+)?\b/gi, '').trim())
    .filter((l) => l && !/^[-=]{3,}$/.test(l.trim()));
}

// Convert extracted text into lines for parseFixedWidth / parseCSV strategies.
export function textToLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd());
}