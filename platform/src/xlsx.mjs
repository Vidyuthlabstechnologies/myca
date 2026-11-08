import { deflateRawSync, crc32 } from 'node:zlib';
import { xmlText } from './text-safe.mjs';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const SHEET_NAME_LIMIT = 31;
const DEFAULT_WIDTH = 14;
const WIDE_WIDTH = 40;
const HEADER_STYLE = 1;
const NUMBER_STYLE = 2;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;
const DEFLATE = 8;
const ZIP_VERSION = 20;

function columnName(index) {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

function cleanSheetName(name, position) {
  const stripped = String(name ?? '').replace(/[[\]:*?/\\]/g, '').replace(/^'+|'+$/g, '').trim();
  return (stripped || `Sheet${position + 1}`).slice(0, SHEET_NAME_LIMIT);
}

export function sheetNames(names) {
  const taken = new Set();
  return names.map((name, position) => {
    const base = cleanSheetName(name, position);
    let candidate = base;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
      const suffix = ` (${n})`;
      candidate = `${base.slice(0, SHEET_NAME_LIMIT - suffix.length)}${suffix}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

function isTextLike(value) {
  if (typeof value !== 'string' || value === '') return false;
  return !/^-?\d+(?:\.\d+)?$/.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value);
}

function widthsFor(sheet, columns) {
  const given = Array.isArray(sheet.widths) ? sheet.widths : [];
  const widths = [];
  let wide = -1;
  for (let column = 0; column < columns; column += 1) {
    if (wide < 0 && sheet.rows.some((row) => isTextLike(row[column]))) wide = column;
  }
  for (let column = 0; column < columns; column += 1) {
    const chosen = Number(given[column]);
    widths.push(Number.isFinite(chosen) && chosen > 0 ? chosen : column === wide ? WIDE_WIDTH : DEFAULT_WIDTH);
  }
  return widths;
}

function textCell(ref, value, style) {
  const text = String(value);
  const preserve = /^\s|\s$|[\n\r\t]/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t${preserve}>${xmlText(text)}</t></is></c>`;
}

function cell(ref, value, header) {
  if (value == null || value === '') return '';
  if (header) return textCell(ref, value, HEADER_STYLE);
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}" s="${NUMBER_STYLE}"><v>${value}</v></c>` : '';
  if (typeof value === 'bigint') return `<c r="${ref}" s="${NUMBER_STYLE}"><v>${value}</v></c>`;
  return textCell(ref, value, 0);
}

function rowXml(values, rowNumber, header) {
  const cells = values.map((value, column) => cell(`${columnName(column)}${rowNumber}`, value, header)).join('');
  return `<row r="${rowNumber}">${cells}</row>`;
}

function worksheetXml(sheet) {
  const header = Array.isArray(sheet.header) ? sheet.header : [];
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  let columns = Math.max(1, header.length);
  for (const row of rows) if (row.length > columns) columns = row.length;
  const lastRow = rows.length + 1;
  const widths = widthsFor({ rows, widths: sheet.widths }, columns);
  const cols = widths.map((width, column) => `<col min="${column + 1}" max="${column + 1}" width="${width}" customWidth="1"/>`).join('');
  const body = [rowXml(header, 1, true)];
  for (let index = 0; index < rows.length; index += 1) body.push(rowXml(rows[index], index + 2, false));
  return `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">
<dimension ref="A1:${columnName(columns - 1)}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>
${body.join('\n')}
</sheetData>
</worksheet>`;
}

function contentTypesXml(count) {
  const sheets = Array.from({ length: count }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n');
  return `${XML_HEAD}<Types xmlns="${CONTENT_TYPES_NS}">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets}
</Types>`;
}

function rootRelsXml() {
  return `${XML_HEAD}<Relationships xmlns="${PACKAGE_REL_NS}">
<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(names) {
  const sheets = names.map((name, i) => `<sheet name="${xmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('\n');
  return `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">
<sheets>
${sheets}
</sheets>
</workbook>`;
}

function workbookRelsXml(count) {
  const sheets = Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n');
  return `${XML_HEAD}<Relationships xmlns="${PACKAGE_REL_NS}">
${sheets}
<Relationship Id="rId${count + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function zipEntry(name, text, offset) {
  const nameBytes = Buffer.from(name, 'utf8');
  const data = Buffer.from(text, 'utf8');
  const packed = deflateRawSync(data);
  const checksum = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(LOCAL_HEADER, 0);
  local.writeUInt16LE(ZIP_VERSION, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(DEFLATE, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(CENTRAL_HEADER, 0);
  central.writeUInt16LE(ZIP_VERSION, 4);
  central.writeUInt16LE(ZIP_VERSION, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(DEFLATE, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);
  return { body: Buffer.concat([local, nameBytes, packed]), central: Buffer.concat([central, nameBytes]) };
}

function zip(parts) {
  const bodies = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of parts) {
    const entry = zipEntry(name, text, offset);
    bodies.push(entry.body);
    centrals.push(entry.central);
    offset += entry.body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_RECORD, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...bodies, directory, end]);
}

export function xlsxWorkbook(sheets) {
  const list = Array.isArray(sheets) && sheets.length ? sheets : [{ name: 'Sheet1', header: [], rows: [] }];
  const names = sheetNames(list.map((sheet) => sheet.name));
  const parts = [
    ['[Content_Types].xml', contentTypesXml(list.length)],
    ['_rels/.rels', rootRelsXml()],
    ['xl/workbook.xml', workbookXml(names)],
    ['xl/_rels/workbook.xml.rels', workbookRelsXml(list.length)],
    ['xl/styles.xml', stylesXml()],
    ...list.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, worksheetXml(sheet)]),
  ];
  return zip(parts);
}
