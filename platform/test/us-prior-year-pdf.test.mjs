import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { documentsOf } from '../src/document-store.mjs';
import { readPdf, pdfBytesOf } from '../src/pdf-read.mjs';
import { readUsPriorYearPdf, parseAmount } from '../src/us-prior-year-pdf.mjs';
import { importUsPriorYear, usPriorYearPreview, usPriorYearWords } from '../src/us-prior-year.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const FIXTURES = new URL('./fixtures/us-1040/', import.meta.url);
const PAD = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');
const FILE_ID = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const md5 = (...parts) => createHash('md5').update(Buffer.concat(parts)).digest();

function rc4(key, data) {
  const s = [...Array(256).keys()];
  for (let i = 0, j = 0; i < 256; i += 1) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k += 1) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

function hashR6(salt) {
  let k = createHash('sha256').update(salt).digest();
  let e = Buffer.alloc(0);
  for (let round = 0; round < 64 || e[e.length - 1] > round - 32; round += 1) {
    const cipher = createCipheriv('aes-128-cbc', k.subarray(0, 16), k.subarray(16, 32));
    cipher.setAutoPadding(false);
    e = Buffer.concat([cipher.update(Buffer.concat(Array(64).fill(k))), cipher.final()]);
    const sum = [...e.subarray(0, 16)].reduce((a, b) => a + b, 0);
    k = createHash(['sha256', 'sha384', 'sha512'][sum % 3]).update(e).digest();
  }
  return k.subarray(0, 32);
}

function aes(bits, key, data) {
  const iv = randomBytes(16);
  const cipher = createCipheriv(`aes-${bits}-cbc`, key, iv);
  return Buffer.concat([iv, cipher.update(data), cipher.final()]);
}

function securityFor(kind) {
  if (!kind) return null;
  if (kind === 'aes256') {
    const fileKey = randomBytes(32);
    const validation = randomBytes(8);
    const keySalt = randomBytes(8);
    const cipher = createCipheriv('aes-256-cbc', hashR6(keySalt), Buffer.alloc(16));
    cipher.setAutoPadding(false);
    const ue = Buffer.concat([cipher.update(fileKey), cipher.final()]);
    const u = Buffer.concat([hashR6(validation), validation, keySalt]);
    return {
      dict: `<< /Filter /Standard /V 5 /R 6 /Length 256 /CF << /StdCF << /CFM /AESV3 /Length 32 /AuthEvent /DocOpen >> >> /StmF /StdCF /StrF /StdCF /O <${randomBytes(48).toString('hex')}> /U <${u.toString('hex')}> /OE <${randomBytes(32).toString('hex')}> /UE <${ue.toString('hex')}> /Perms <${randomBytes(16).toString('hex')}> /P -4 >>`,
      encrypt: (num, gen, data) => aes(256, fileKey, data),
    };
  }
  const o = randomBytes(32);
  const p = Buffer.alloc(4);
  p.writeInt32LE(-4);
  let key = md5(PAD, o, p, FILE_ID);
  for (let i = 0; i < 50; i += 1) key = md5(key.subarray(0, 16));
  key = key.subarray(0, 16);
  let u = rc4(key, md5(PAD, FILE_ID));
  for (let i = 1; i <= 19; i += 1) u = rc4(Buffer.from(key.map((b) => b ^ i)), u);
  if (kind === 'wrong-password') u = Buffer.from(u.map((b) => b ^ 255));
  u = Buffer.concat([u, Buffer.alloc(16)]);
  const aesMode = kind === 'aes128';
  const objectKey = (num, gen) => md5(key, Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, 0]), aesMode ? Buffer.from('sAlT') : Buffer.alloc(0)).subarray(0, 16);
  const filters = aesMode ? ' /V 4 /R 4 /CF << /StdCF << /CFM /AESV2 /Length 16 /AuthEvent /DocOpen >> >> /StmF /StdCF /StrF /StdCF' : ' /V 2 /R 3';
  return {
    dict: `<< /Filter /Standard${filters} /Length 128 /O <${o.toString('hex')}> /U <${u.toString('hex')}> /P -4 >>`,
    encrypt: (num, gen, data) => (aesMode ? aes(128, objectKey(num, gen), data) : rc4(objectKey(num, gen), data)),
  };
}

function buildPdf(objects, { packed = [], security = null, compress = true } = {}) {
  const sec = securityFor(security);
  const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let size = chunks[0].length;
  const offsets = new Map();
  const write = (buffer) => {
    chunks.push(buffer);
    size += buffer.length;
  };
  const str = (num) => (text) => {
    const bytes = Buffer.from(text, 'latin1');
    return `<${(sec ? sec.encrypt(num, 0, bytes) : bytes).toString('hex')}>`;
  };
  const all = [...objects];
  const encryptNum = sec ? all.length + 1 : null;
  if (sec) all.push({ dict: () => sec.dict, plain: true });
  const packedSet = new Set(packed);
  const writeObject = (num, item) => {
    offsets.set(num, size);
    const dict = item.dict(item.plain ? (text) => `<${Buffer.from(text, 'latin1').toString('hex')}>` : str(num));
    if (item.stream === undefined) {
      write(Buffer.from(`${num} 0 obj\n${dict}\nendobj\n`, 'latin1'));
      return;
    }
    let data = Buffer.isBuffer(item.stream) ? item.stream : Buffer.from(item.stream, 'latin1');
    let filter = '';
    if (compress) {
      data = deflateSync(data);
      filter = ' /Filter /FlateDecode';
    }
    if (sec) data = sec.encrypt(num, 0, data);
    write(Buffer.from(`${num} 0 obj\n<< ${dict.replace(/^<<|>>$/g, '')} /Length ${data.length}${filter} >>\nstream\n`, 'latin1'));
    write(data);
    write(Buffer.from('\nendstream\nendobj\n', 'latin1'));
  };
  all.forEach((item, index) => {
    if (!packedSet.has(index + 1)) writeObject(index + 1, item);
  });
  const trailerExtra = `/Root 1 0 R${sec ? ` /Encrypt ${encryptNum} 0 R` : ''} /ID [<${FILE_ID.toString('hex')}> <${FILE_ID.toString('hex')}>]`;
  if (packed.length) {
    const streamNum = all.length + 1;
    let header = '';
    let body = '';
    for (const num of packed) {
      const text = `${all[num - 1].dict(str(num))}\n`;
      header += `${num} ${body.length} `;
      body += text;
    }
    const content = Buffer.from(`${header}\n${body}`, 'latin1');
    const first = Buffer.byteLength(`${header}\n`, 'latin1');
    const data = deflateSync(content);
    offsets.set(streamNum, size);
    write(Buffer.from(`${streamNum} 0 obj\n<< /Type /ObjStm /N ${packed.length} /First ${first} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, 'latin1'));
    write(data);
    write(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    const xrefNum = streamNum + 1;
    const total = xrefNum + 1;
    const rows = [];
    for (let num = 0; num < total; num += 1) {
      const row = Buffer.alloc(7);
      if (num === 0) row.writeUInt8(0, 0);
      else if (packedSet.has(num)) {
        row.writeUInt8(2, 0);
        row.writeUInt32BE(streamNum, 1);
        row.writeUInt16BE(packed.indexOf(num), 5);
      } else {
        row.writeUInt8(1, 0);
        row.writeUInt32BE(num === xrefNum ? size : offsets.get(num) || 0, 1);
      }
      rows.push(row);
    }
    const predicted = Buffer.concat(rows.map((row) => Buffer.concat([Buffer.from([0]), row])));
    const xref = deflateSync(predicted);
    const at = size;
    write(Buffer.from(`${xrefNum} 0 obj\n<< /Type /XRef /Size ${total} /W [1 4 2] ${trailerExtra} /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length ${xref.length} >>\nstream\n`, 'latin1'));
    write(xref);
    write(Buffer.from(`\nendstream\nendobj\nstartxref\n${at}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(chunks);
  }
  const at = size;
  const count = all.length + 1;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let num = 1; num < count; num += 1) table += `${String(offsets.get(num)).padStart(10, '0')} 00000 n \n`;
  write(Buffer.from(`${table}trailer\n<< /Size ${count} ${trailerExtra} >>\nstartxref\n${at}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

const escapeText = (text) => text.replace(/[\\()]/g, (c) => `\\${c}`);

function textContent(lines, { font = 'F1', hex = null } = {}) {
  const ops = ['BT'];
  lines.forEach(([x, y, text, size = 9], index) => {
    const shown = hex ? `<${hex(text)}>` : `(${escapeText(text)})`;
    ops.push(`/${font} ${size} Tf`);
    if (index % 4 === 0) ops.push(`1 0 0 1 ${x} ${y} Tm ${shown} Tj`);
    else if (index % 4 === 1) ops.push(`1 0 0 1 ${x} ${y} Tm [${shown}] TJ`);
    else if (index % 4 === 2) ops.push(`${size + 2} TL 1 0 0 1 ${x} ${y + size + 2} Tm ${shown} '`);
    else ops.push(`${size + 2} TL 1 0 0 1 ${x} ${y + size + 2} Tm 0 0 ${shown} "`);
  });
  ops.push('ET');
  return ops.join('\n');
}

const LABELS_2024_P1 = [
  [36, 737.9, 'Form 1040 U.S. Individual Income Tax Return 2024', 12],
  [36, 705.6, 'Your first name and middle initial Last name Your social security number', 7],
  [36, 116.3, '11 Subtract line 10 from line 9. This is your adjusted gross income . . . . . . 11'],
  [36, 80.3, '14 Add lines 12 and 13 . . . . . . . . . . . . 14'],
];
const LABELS_2024_P2 = [
  [36, 759.9, 'Form 1040 (2024) Page 2'],
  [36, 650.8, '24 Add lines 22 and 23. This is your total tax . . . . . . . . . 24'],
  [36, 434.8, '36 Amount of line 34 you want applied to your 2025 estimated tax . . . 36'],
];

function fillableReturn({ values, names = {}, security = null, packed = false }) {
  const field = (num, parent, partial, value, rect, page) => ({ dict: (s) => `<< /T ${s(partial)} /Parent ${parent} 0 R /FT /Tx${value === undefined ? '' : ` /V ${s(value)}`} /Type /Annot /Subtype /Widget /Rect [${rect.join(' ')}] /P ${page} 0 R >>` });
  const specs = [
    ['p1', 'f1_04[0]', values.firstName, [36, 690, 236.9, 704]],
    ['p1', 'f1_05[0]', values.lastName, [238.6, 690, 467.3, 704]],
    ['p1', 'f1_06[0]', values.ssn, [469, 690, 576, 704]],
    ['line', names.agi || 'f1_56[0]', values.agi, [504, 114, 576, 126]],
    ['p1', 'f1_59[0]', values.line14, [504, 78, 576, 90]],
    ['p2', 'f2_10[0]', values.totalTax, [504, 648, 576, 660]],
    ['p2', 'f2_27[0]', values.overpaymentApplied, [410.4, 432, 481.7, 443.8]],
  ];
  const objects = [
    { dict: () => '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [8 0 R] >> >>' },
    { dict: () => '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>' },
    { dict: () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R /Annots [${specs.map((spec, i) => (spec[0] === 'p2' ? '' : `${12 + i} 0 R`)).filter(Boolean).join(' ')}] >>` },
    { dict: () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R /Annots [${specs.map((spec, i) => (spec[0] === 'p2' ? `${12 + i} 0 R` : '')).filter(Boolean).join(' ')}] >>` },
    { dict: () => '<< >>', stream: textContent(LABELS_2024_P1) },
    { dict: () => '<< >>', stream: textContent(LABELS_2024_P2) },
    { dict: () => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
    { dict: (s) => `<< /T ${s('topmostSubform[0]')} /Kids [9 0 R 10 0 R] >>` },
    { dict: (s) => `<< /T ${s('Page1[0]')} /Parent 8 0 R /Kids [11 0 R 12 0 R 13 0 R 14 0 R 16 0 R] >>` },
    { dict: (s) => `<< /T ${s('Page2[0]')} /Parent 8 0 R /Kids [17 0 R 18 0 R] >>` },
    { dict: (s) => `<< /T ${s('Line4a-11_ReadOrder[0]')} /Parent 9 0 R /Kids [15 0 R] >>` },
  ];
  specs.forEach(([where, partial, value, rect]) => {
    const parent = where === 'p2' ? 10 : where === 'line' ? 11 : 9;
    const page = where === 'p2' ? 4 : 3;
    objects.push(field(objects.length + 1, parent, partial, value === undefined ? undefined : String(value), rect, page));
  });
  return buildPdf(objects, { security, packed: packed ? [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] : [] });
}

const VALUES_2024 = { firstName: 'Ana', lastName: 'Diaz', ssn: '400123456', agi: '85000', line14: '14600', totalTax: '9,100', overpaymentApplied: '500.00' };

function flattenedReturn({ year = 2024, ssnText = '400-12-3456', worksheet = true, compress = true, packed = false, cid = false, figures = {} } = {}) {
  const next = year + 1;
  const f = { agi: '85,000.', line14: '14,600.', totalTax: '9,100.', applied: '500.', line7: '(3,000.)', sd7: '(2,000.)', sd15: '(6,000.)', sd16: '(8,000.)', sd21: '( 3,000. )', st: '1,200.', lt: '4,800.', ...figures };
  const pages = [
    [
      [36, 748, `Form 1040 U.S. Individual Income Tax Return ${year}`, 12],
      [36, 705.6, 'Your first name and middle initial Last name Your social security number', 7],
      [40, 693, 'Ana Diaz', 9], [480, 693, ssnText, 9],
      [36, 166.9, '7 Capital gain or (loss). Attach Schedule D if required . . . . . 7'], [520, 166.9, f.line7],
      [36, 116.3, `${year === 2025 ? '11a' : '11'} Subtract line 10 from line 9. This is your adjusted gross income . . . . . . ${year === 2025 ? '11a' : '11'}`], [520, 116.3, f.agi],
      [36, 80.3, '14 Add lines 12 and 13 . . . . . . . . . . . . . 14'], [520, 80.3, f.line14],
    ],
    [
      [36, 759.9, `Form 1040 (${year}) Page 2`],
      [36, 650.8, '24 Add lines 22 and 23. This is your total tax . . . . . . . . 24'], [520, 650.8, f.totalTax],
      [36, 434.8, `36 Amount of line 34 you want applied to your ${next} estimated tax . . 36`], [420, 434.8, f.applied],
    ],
    [
      [36, 747.9, 'SCHEDULE D Capital Gains and Losses', 12],
      [36, 374.4, '7 Net short-term capital gain or (loss). Combine lines 1a through 6 in column (h). If you have any long-'],
      [36, 363.6, 'term capital gains or losses, go to Part II below. Otherwise, go to Part III on the back . . . . 7'], [520, 363.6, f.sd7],
      [36, 73.4, '15 Net long-term capital gain or (loss). Combine lines 8a through 14 in column (h). Then, go to Part III'],
      [36, 62.6, 'on the back . . . . . . . . . . . . . . . . . . . . 15'], [520, 62.6, f.sd15],
    ],
    [
      [36, 748.4, `Schedule D (Form 1040) ${year} Page 2`],
      [36, 698.6, '16 Combine lines 7 and 15 and enter the result . . . . . . . 16'], [520, 698.6, f.sd16],
      [36, 375, '21 If line 16 is a loss, enter here and on Form 1040, line 7, the smaller of:'],
      [36, 363, '• The loss on line 16; or . . . . . . . . . . . . 21'], [500, 363, f.sd21],
    ],
  ];
  if (worksheet) pages.push([
    [36, 737.6, 'Capital Loss Carryover Worksheet—Lines 6 and 14 Keep for Your Records', 11],
    [36, 506.4, `8. Short-term capital loss carryover for ${next}. Subtract line 7 from line 5. If zero or less, enter -0-. If more`],
    [36, 497.9, 'than zero, also enter this amount on Schedule D, line 6 ...................... 8.'], [520, 497.9, f.st],
    [36, 404.7, `13. Long-term capital loss carryover for ${next}. Subtract line 12 from line 9. If zero or less, enter -0-. If more`],
    [36, 396.2, 'than zero, also enter this amount on Schedule D, line 14 ..................... 13.'], [520, 396.2, f.lt],
  ]);
  const count = pages.length;
  const firstPage = 4;
  const firstContent = firstPage + count;
  const font = cid
    ? '<< /Type /Font /Subtype /Type0 /BaseFont /Arial /Encoding /Identity-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Arial /DW 500 /W [288 [278] 300 400 556] >>] /ToUnicode 3 0 R >>'
    : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Differences [150 /endash] >> >>';
  const cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n1 beginbfrange <0120> <017E> <0020> endbfrange\n1 beginbfchar <0200> <2022> endbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end';
  const hex = (text) => [...text].map((ch) => (ch === '•' ? 0x200 : ch.charCodeAt(0) + 0x100).toString(16).padStart(4, '0')).join('');
  const objects = [
    { dict: () => '<< /Type /Catalog /Pages 2 0 R >>' },
    { dict: () => `<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPage + i} 0 R`).join(' ')}] /Count ${count} /Resources << /Font << /F1 ${firstContent + count} 0 R >> >> >>` },
    { dict: () => '<< >>', stream: cmap },
    ...pages.map((_, i) => ({ dict: () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${firstContent + i} 0 R >>` })),
    ...pages.map((lines) => ({ dict: () => '<< >>', stream: cid ? textContent(lines, { hex }) : textContent(lines.map(([x, y, text, size]) => [x, y, text.replace(/•/g, '\x95'), size])) })),
    { dict: () => font },
  ];
  return buildPdf(objects, { compress, packed: packed ? [1, 2, ...pages.map((_, i) => firstPage + i), firstContent + count] : [] });
}

function dataUrl(bytes) {
  return `data:application/pdf;base64,${bytes.toString('base64')}`;
}

async function stateWith(taxYear, taxpayer) {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  if (taxpayer) {
    const set = await runTool(state, 'set_us_taxpayer', { taxYear, filingStatus: 'single', taxpayer });
    assert.equal(set.ok, true, JSON.stringify(set));
  }
  return state;
}

const upload = (state, bytes) => documentsOf(state).put(dataUrl(bytes)).sha256;

test('amounts read the way returns print them', () => {
  assert.equal(parseAmount('85,000.'), 85000);
  assert.equal(parseAmount('9100.40'), 9100.4);
  assert.equal(parseAmount('(3,000)'), -3000);
  assert.equal(parseAmount('( 3,000. )'), -3000);
  assert.equal(parseAmount('-1,500'), -1500);
  assert.equal(parseAmount('$ 12,345'), 12345);
  assert.equal(parseAmount('12a'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('1e30'), null);
});

test('a filled 1040 form (AcroForm fields under the IRS 2024 names) gives AGI, total tax, refund applied, name and SSN last four', () => {
  const read = readUsPriorYearPdf(fillableReturn({ values: VALUES_2024 }), { priorYear: '2024' });
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.taxYear, '2024');
  assert.deepEqual(Object.fromEntries(Object.entries(read.figures).map(([key, item]) => [key, item.value])), { agi: 85000, totalTax: 9100, overpaymentApplied: 500 });
  assert.equal(read.figures.agi.confidence, 0.95);
  assert.match(read.figures.agi.where, /Form 1040 line 11, form field Page1\[0\]\.Line4a-11_ReadOrder\[0\]\.f1_56\[0\]/);
  assert.deepEqual(read.filer, { name: 'Ana Diaz', lastName: 'Diaz', ssnLast4: '3456', spouseSsnLast4: '' });
  assert.ok(!JSON.stringify(read).includes('400123456'));
});

test('a form field with another program\'s name is read by its place on the line-11 row, at lower confidence', () => {
  const read = readUsPriorYearPdf(fillableReturn({ values: VALUES_2024, names: { agi: 'AGI_Line11' } }), { priorYear: '2024' });
  assert.equal(read.figures.agi.value, 85000);
  assert.equal(read.figures.agi.confidence, 0.85);
  assert.match(read.figures.agi.where, /AGI_Line11/);
});

test('fields packed in an object stream with a cross-reference stream read the same', () => {
  const pdf = fillableReturn({ values: VALUES_2024, packed: true });
  assert.ok(pdf.includes('/ObjStm') && pdf.includes('/XRef'));
  const read = readUsPriorYearPdf(pdf, { priorYear: '2024' });
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.figures.totalTax.value, 9100);
  assert.equal(read.filer.ssnLast4, '3456');
});

test('a printed (flattened) return in compressed content streams: 1040, Schedule D and the carryover worksheet', () => {
  const pdf = flattenedReturn();
  assert.ok(pdf.includes('/FlateDecode'));
  const read = readUsPriorYearPdf(pdf, { priorYear: '2024' });
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.taxYear, '2024');
  const values = Object.fromEntries(Object.entries(read.figures).map(([key, item]) => [key, item.value]));
  assert.deepEqual(values, { agi: 85000, totalTax: 9100, overpaymentApplied: 500, shortTermLossCarryover: 1200, longTermLossCarryover: 4800 });
  assert.match(read.figures.shortTermLossCarryover.where, /Capital Loss Carryover Worksheet line 8, printed on page 5/);
  assert.equal(read.figures.agi.confidence, 0.8);
  assert.equal(read.filer.name, 'Ana Diaz');
  assert.equal(read.filer.ssnLast4, '3456');
  assert.ok(!JSON.stringify(read).includes('400-12-3456'));
});

test('a carryover worksheet for a different year is not used', () => {
  const read = readUsPriorYearPdf(flattenedReturn(), { priorYear: '2023' });
  assert.equal(read.figures.shortTermLossCarryover, undefined);
  assert.ok(read.notes.some((note) => /worksheet for another year \(2025\)/.test(note)));
});

test('without the worksheet the carryover is worked out from Schedule D lines 7, 15, 21 and 1040 lines 11 and 14', () => {
  const wsLine1 = 40000 - 15750;
  const wsLine4 = Math.min(3000, Math.max(0, wsLine1 + 3000));
  const shortTerm = Math.max(0, 2000 - (wsLine4 + 0));
  const longTerm = Math.max(0, 6000 - (0 + Math.max(0, wsLine4 - 2000)));
  const read = readUsPriorYearPdf(flattenedReturn({ year: 2025, worksheet: false, packed: true, cid: true, figures: { agi: '40,000', line14: '15,750' } }), { priorYear: '2025' });
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.taxYear, '2025');
  assert.equal(read.figures.agi.value, 40000);
  assert.equal(shortTerm, 0);
  assert.equal(read.figures.shortTermLossCarryover, undefined);
  assert.equal(read.figures.longTermLossCarryover.value, longTerm);
  assert.equal(longTerm, 5000);
  assert.ok(read.figures.longTermLossCarryover.confidence < 0.7);
  assert.ok(read.notes.some((note) => /worked out from Schedule D/.test(note)));
});

test('with no taxable income nothing of the loss is used, so both carryovers are the whole loss', () => {
  const wsLine1 = 10000 - 15750;
  const wsLine4 = Math.min(3000, Math.max(0, wsLine1 + 3000));
  const read = readUsPriorYearPdf(flattenedReturn({ year: 2025, worksheet: false, figures: { agi: '10,000', line14: '15,750' } }), { priorYear: '2025' });
  assert.equal(wsLine4, 0);
  assert.equal(read.figures.shortTermLossCarryover.value, 2000 - wsLine4);
  assert.equal(read.figures.longTermLossCarryover.value, 6000 - Math.max(0, wsLine4 - 2000));
});

test('Schedule D without line 11 or 14 gives a note instead of a guessed carryover', () => {
  const read = readUsPriorYearPdf(flattenedReturn({ worksheet: false, figures: { line14: '' } }), { priorYear: '2024' });
  assert.equal(read.figures.longTermLossCarryover, undefined);
  assert.ok(read.notes.some((note) => /capital loss of 8,000 with 3,000 allowed/.test(note)));
});

test('text through a Type0 font with a ToUnicode CMap and word spacing from glyph widths', () => {
  const read = readPdf(flattenedReturn({ cid: true }));
  assert.equal(read.ok, true);
  assert.ok(read.pages[1].lines.some((line) => line.text.startsWith('24 Add lines 22 and 23. This is your total tax')));
  assert.ok(read.pages[3].lines.some((line) => line.text.startsWith('• The loss on line 16')));
});

for (const security of ['rc4', 'aes128', 'aes256']) {
  test(`a PDF encrypted with ${security} and no open password is read`, () => {
    const read = readUsPriorYearPdf(fillableReturn({ values: VALUES_2024, security }), { priorYear: '2024' });
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.equal(read.figures.agi.value, 85000);
    assert.equal(read.filer.name, 'Ana Diaz');
  });
}

test('a PDF that needs a password to open is refused with a clear error', () => {
  assert.equal(readUsPriorYearPdf(fillableReturn({ values: VALUES_2024, security: 'wrong-password' })).error, 'PDF_PASSWORD_REQUIRED');
});

test('the real IRS 2024 and 2025 fillable Form 1040, filled in, read by their field names', () => {
  const y2024 = readUsPriorYearPdf(readFileSync(new URL('f1040-2024-filled.pdf', FIXTURES)), { priorYear: '2024' });
  assert.equal(y2024.taxYear, '2024');
  assert.deepEqual(Object.fromEntries(Object.entries(y2024.figures).map(([key, item]) => [key, item.value])), { agi: 85000, totalTax: 9100, overpaymentApplied: 500 });
  assert.ok(y2024.notes.some((note) => /Line 7 shows a capital loss of 3,000/.test(note)));
  assert.equal(y2024.filer.ssnLast4, '3456');
  const y2025 = readUsPriorYearPdf(readFileSync(new URL('f1040-2025-filled.pdf', FIXTURES)), { priorYear: '2025' });
  assert.equal(y2025.taxYear, '2025');
  assert.deepEqual(Object.fromEntries(Object.entries(y2025.figures).map(([key, item]) => [key, item.value])), { agi: 91250, totalTax: 10412, overpaymentApplied: 250 });
  assert.match(y2025.figures.agi.where, /f1_75/);
  assert.equal(y2025.filer.name, 'Ana Diaz');
});

test('bad input never throws: it comes back as ok false with a reason', () => {
  const good = fillableReturn({ values: VALUES_2024 });
  const zeros = deflateSync(Buffer.alloc(40 * 1024 * 1024));
  const bomb = Buffer.concat([Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Filter /FlateDecode /Length ${zeros.length} >>\nstream\n`), zeros, Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n')]);
  const loop = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [3 0 R] >> >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [2 0 R] >>\nendobj\n3 0 obj\n<< /T (a) /Kids [3 0 R] /Parent 3 0 R >>\nendobj\n4 0 obj 4 0 R\nendobj\ntrailer\n<< /Root 1 0 R >>\n');
  const deep = Buffer.from(`%PDF-1.4\n1 0 obj\n${'['.repeat(100000)}\nendobj\ntrailer\n<< /Root 1 0 R >>\n`);
  const cases = [
    [Buffer.from('hello'), 'NOT_A_PDF'],
    ['', 'NOT_A_PDF'],
    [null, 'NOT_A_PDF'],
    [Buffer.from('%PDF-1.7\n'), 'PDF_UNREADABLE'],
    [bomb, 'PDF_TOO_LARGE'],
  ];
  for (const [input, error] of cases) assert.equal(readPdf(input).error, error);
  assert.equal(readPdf(good, { maxBytes: 100 }).error, 'PDF_TOO_LARGE');
  assert.equal(readPdf(readFileSync(new URL('f1040-2024-filled.pdf', FIXTURES)), { maxMs: -1 }).error, 'PDF_TIMEOUT');
  for (const input of [loop, deep, good.subarray(0, Math.floor(good.length / 2)), Buffer.concat([good.subarray(0, 400), randomBytes(3000)]), randomBytes(5000)]) {
    const read = readPdf(input);
    assert.equal(typeof read.ok, 'boolean');
  }
  for (let i = 0; i < 40; i += 1) {
    const copy = Buffer.from(good);
    for (let j = 0; j < 30; j += 1) copy[Math.floor(Math.random() * copy.length)] = Math.floor(Math.random() * 256);
    assert.equal(typeof readUsPriorYearPdf(copy).ok, 'boolean');
  }
});

test('uploaded content is accepted as a data URL, base64 or raw PDF text', () => {
  const pdf = fillableReturn({ values: VALUES_2024 });
  assert.deepEqual(pdfBytesOf(dataUrl(pdf)), pdf);
  assert.deepEqual(pdfBytesOf(pdf.toString('base64')), pdf);
  assert.deepEqual(pdfBytesOf(pdf.toString('latin1')), pdf);
  assert.equal(pdfBytesOf('just words'), null);
});

test('import from last year\'s PDF: preview shows each figure with where it was found, then the answers are filled', async () => {
  const state = await stateWith('2025', { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456' });
  const sha = upload(state, flattenedReturn());
  const preview = usPriorYearPreview(state, { taxYear: '2025', documentSha256: sha });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Bring 2024 into the 2025 return from last year's Form 1040 PDF/);
  assert.match(preview.effects[0], /Read a 2024 Form 1040 PDF for Ana Diaz, SSN ending 3456/);
  assert.ok(preview.effects.some((effect) => /Last year's adjusted gross income \(Form 1040 line 11\): \$85,000 \(read from the PDF: Form 1040 line 11, printed on page 1; medium confidence\)/.test(effect)));
  assert.ok(preview.effects.some((effect) => /Long-term capital loss carryover: \$4,800/.test(effect)));
  assert.ok(!preview.effects.some((effect) => /^Check:/.test(effect)));
  assert.equal(preview.figures.pdfTaxYear, '2024');
  const result = importUsPriorYear(state, { taxYear: '2025', documentSha256: sha });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.source, 'pdf');
  assert.deepEqual(result.data.answers, { priorYearAgi: 85000, priorYearTax: 9100, priorYearOverpaymentApplied: 500, shortTermLossCarryover: 1200, longTermLossCarryover: 4800 });
  assert.equal(result.data.pdf.ssnLast4, '3456');
  assert.match(usPriorYearWords(result.data), /Brought 2024 into your 2025 return from last year's Form 1040 PDF, filled 5 answers\./);
  const event = state.auditEvents.find((item) => item.action === 'us_prior_year_imported');
  assert.equal(event.metadata.documentSha256, sha);
  assert.deepEqual(event.metadata.readFromPdf, ['agi', 'totalTax', 'overpaymentApplied', 'shortTermLossCarryover', 'longTermLossCarryover']);
  for (const text of [JSON.stringify(result), JSON.stringify(preview), JSON.stringify(state.auditEvents)]) assert.ok(!/400-?12-?3456/.test(text));
  const interview = await runTool(state, 'us_interview', { taxYear: '2025' });
  assert.equal(interview.data.questions.find((question) => question.id === 'priorYearAgi')?.answer ?? state.usReturns['2025'].answers.priorYearAgi, 85000);
});

test('a typed figure wins over the PDF and the preview does not claim it was read', async () => {
  const state = await stateWith('2025');
  const sha = upload(state, flattenedReturn());
  const preview = usPriorYearPreview(state, { taxYear: '2025', documentSha256: sha, figures: { agi: 84000 } });
  assert.ok(preview.effects.some((effect) => effect === 'Last year\'s adjusted gross income (Form 1040 line 11): $84,000'));
  const result = importUsPriorYear(state, { taxYear: '2025', documentSha256: sha, figures: { agi: 84000 } });
  assert.equal(result.data.answers.priorYearAgi, 84000);
  assert.deepEqual(state.auditEvents.find((item) => item.action === 'us_prior_year_imported').metadata.typedOverPdf, ['agi']);
});

test('the wrong year, another person\'s SSN or name are warned about before import', async () => {
  const state = await stateWith('2026', { firstName: 'Ben', lastName: 'Lee', ssn: '400-12-9999' });
  const sha = upload(state, flattenedReturn({ year: 2024 }));
  const preview = usPriorYearPreview(state, { taxYear: '2026', documentSha256: sha });
  const checks = preview.effects.filter((effect) => effect.startsWith('Check:'));
  assert.ok(checks.some((effect) => /This PDF is a 2024 Form 1040, but the 2026 return needs figures from 2025\./.test(effect)));
  assert.ok(checks.some((effect) => /The SSN on the PDF ends in 3456, which does not match the SSN on this return\./.test(effect)));
  assert.ok(checks.some((effect) => /The name on the PDF \(Ana Diaz\) does not match/.test(effect)));
  const result = importUsPriorYear(state, { taxYear: '2026', documentSha256: sha });
  assert.equal(result.ok, true);
  assert.match(usPriorYearWords(result.data), /Check: This PDF is a 2024 Form 1040/);
  assert.equal(result.data.answers.shortTermLossCarryover, undefined);
});

test('a PDF that is not a 1040, an empty form, a missing upload and a bad hash are refused with a hint', async () => {
  const state = await stateWith('2025');
  const blank = upload(state, fillableReturn({ values: {} }));
  assert.equal(importUsPriorYear(state, { taxYear: '2025', documentSha256: blank }).error, 'US_PRIOR_YEAR_PDF_NOTHING_READ');
  const words = documentsOf(state).put('not a pdf').sha256;
  const notPdf = importUsPriorYear(state, { taxYear: '2025', documentSha256: words });
  assert.equal(notPdf.error, 'NOT_A_PDF');
  assert.match(notPdf.hint, /Upload the PDF of last year's Form 1040/);
  const other = upload(state, buildPdf([{ dict: () => '<< /Type /Catalog /Pages 2 0 R >>' }, { dict: () => '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' }, { dict: () => '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>' }, { dict: () => '<< >>', stream: textContent([[36, 700, 'Grocery receipt total 12.00']]) }, { dict: () => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' }]));
  assert.equal(importUsPriorYear(state, { taxYear: '2025', documentSha256: other }).error, 'NOT_A_FORM_1040');
  assert.equal(importUsPriorYear(state, { taxYear: '2025', documentSha256: 'f'.repeat(64) }).error, 'DOCUMENT_BYTES_MISSING');
  assert.equal(importUsPriorYear(state, { taxYear: '2025', documentSha256: 'nope' }).error, 'INVALID_SHA256');
  assert.match(usPriorYearPreview(state, { taxYear: '2025', documentSha256: blank }).blockers[0], /No figure was found in the PDF/);
});

test('the tool takes documentSha256 through the schema and runs', async () => {
  assert.equal(validateAssistantToolCall('import_us_prior_year', { taxYear: '2025', documentSha256: 'a'.repeat(64) }).ok, true);
  assert.equal(validateAssistantToolCall('import_us_prior_year', { taxYear: '2025', documentSha256: 'xyz' }).ok, false);
  const state = await stateWith('2025');
  const sha = upload(state, fillableReturn({ values: VALUES_2024, packed: true }));
  const ran = await runTool(state, 'import_us_prior_year', { taxYear: '2025', documentSha256: sha });
  assert.equal(ran.ok, true, JSON.stringify(ran));
  assert.equal(ran.data.answers.priorYearTax, 9100);
});
