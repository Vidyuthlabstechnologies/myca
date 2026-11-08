export function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

const FORMULA_START = /^[\s\uFEFF]*[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/;

function quoted(text) {
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvCell(value) {
  let text = String(value ?? '');
  const numeric = /^-?\d+(?:\.\d+)?$/.test(text);
  if (!numeric && (FORMULA_START.test(text) || /^[\t\r]/.test(text))) text = `'${text}`;
  return quoted(text);
}

export function csvRows(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function csvRawRows(rows) {
  return rows.map((row) => row.map((value) => quoted(String(value ?? ''))).join(',')).join('\n');
}

const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlText(value) {
  return htmlEscape(String(value ?? '').replace(XML_FORBIDDEN, ''));
}
