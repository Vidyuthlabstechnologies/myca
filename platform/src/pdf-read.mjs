import { inflateSync, constants as zlibConstants } from 'node:zlib';
import { createHash, createCipheriv, createDecipheriv } from 'node:crypto';

export const PDF_LIMITS = Object.freeze({
  maxBytes: 20 * 1024 * 1024,
  maxMs: 5000,
  maxObjects: 200000,
  maxStreamBytes: 32 * 1024 * 1024,
  maxTotalInflated: 160 * 1024 * 1024,
  maxPages: 400,
  maxRuns: 400000,
  maxFields: 20000,
  maxDepth: 48,
});

class PdfStop extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

class Name {
  constructor(name) {
    this.name = name;
  }
}

class Str {
  constructor(bytes) {
    this.bytes = bytes;
  }
}

class Ref {
  constructor(num, gen) {
    this.num = num;
    this.gen = gen;
  }
}

class Dict {
  constructor() {
    this.map = new Map();
  }
  get(key) {
    return this.map.get(key);
  }
}

class Stream {
  constructor(dict, raw, num, gen) {
    this.dict = dict;
    this.raw = raw;
    this.num = num;
    this.gen = gen;
  }
}

class Op {
  constructor(op) {
    this.op = op;
  }
}

const END_ARRAY = Symbol('endArray');
const END_DICT = Symbol('endDict');
const EOF = Symbol('eof');

const WHITE = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

const isWhite = (c) => WHITE.has(c);
const isRegular = (c) => c !== undefined && !WHITE.has(c) && !DELIM.has(c);

class Lexer {
  constructor(buf, pos = 0, end = buf.length, budget) {
    this.buf = buf;
    this.pos = pos;
    this.end = end;
    this.budget = budget;
    this.depth = 0;
  }

  enter() {
    this.depth += 1;
    if (this.depth > 256) throw new PdfStop('PDF_TOO_DEEP');
  }

  skip() {
    const { buf } = this;
    while (this.pos < this.end) {
      const c = buf[this.pos];
      if (isWhite(c)) this.pos += 1;
      else if (c === 37) {
        while (this.pos < this.end && buf[this.pos] !== 10 && buf[this.pos] !== 13) this.pos += 1;
      } else break;
    }
  }

  word() {
    const start = this.pos;
    while (this.pos < this.end && isRegular(this.buf[this.pos])) this.pos += 1;
    return this.buf.toString('latin1', start, this.pos);
  }

  name() {
    this.pos += 1;
    const raw = this.word();
    return new Name(raw.includes('#') ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : raw);
  }

  literal() {
    const { buf } = this;
    this.pos += 1;
    const out = [];
    let depth = 1;
    while (this.pos < this.end) {
      const c = buf[this.pos++];
      if (c === 92) {
        const n = buf[this.pos++];
        if (n === 110) out.push(10);
        else if (n === 114) out.push(13);
        else if (n === 116) out.push(9);
        else if (n === 98) out.push(8);
        else if (n === 102) out.push(12);
        else if (n === 13) {
          if (buf[this.pos] === 10) this.pos += 1;
        } else if (n === 10) {
          continue;
        } else if (n >= 48 && n <= 55) {
          let value = n - 48;
          for (let i = 0; i < 2 && buf[this.pos] >= 48 && buf[this.pos] <= 55; i += 1) value = value * 8 + (buf[this.pos++] - 48);
          out.push(value & 255);
        } else if (n !== undefined) out.push(n);
      } else if (c === 40) {
        depth += 1;
        out.push(c);
      } else if (c === 41) {
        depth -= 1;
        if (depth === 0) break;
        out.push(c);
      } else out.push(c);
    }
    return new Str(Buffer.from(out));
  }

  hex() {
    this.pos += 1;
    const start = this.pos;
    while (this.pos < this.end && this.buf[this.pos] !== 62) this.pos += 1;
    const digits = this.buf.toString('latin1', start, this.pos).replace(/[^0-9a-fA-F]/g, '');
    this.pos += 1;
    return new Str(Buffer.from(digits.length % 2 ? `${digits}0` : digits, 'hex'));
  }

  token(allowOps = false) {
    this.skip();
    if (this.pos >= this.end) return EOF;
    const { buf } = this;
    const c = buf[this.pos];
    if (c === 47) return this.name();
    if (c === 40) return this.literal();
    if (c === 60) {
      if (buf[this.pos + 1] === 60) {
        this.pos += 2;
        return this.dict(allowOps);
      }
      return this.hex();
    }
    if (c === 91) {
      this.pos += 1;
      return this.array(allowOps);
    }
    if (c === 93) {
      this.pos += 1;
      return END_ARRAY;
    }
    if (c === 62 && buf[this.pos + 1] === 62) {
      this.pos += 2;
      return END_DICT;
    }
    if (c === 123 || c === 125 || c === 41 || c === 62) {
      this.pos += 1;
      return allowOps ? new Op(String.fromCharCode(c)) : this.token(allowOps);
    }
    const word = this.word();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      const number = Number(word);
      if (!allowOps && /^\d+$/.test(word)) {
        const save = this.pos;
        this.skip();
        const gen = this.word();
        if (/^\d+$/.test(gen)) {
          this.skip();
          if (buf[this.pos] === 82 && !isRegular(buf[this.pos + 1])) {
            this.pos += 1;
            return new Ref(number, Number(gen));
          }
        }
        this.pos = save;
      }
      return number;
    }
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    if (!word) {
      this.pos += 1;
      return this.token(allowOps);
    }
    return new Op(word);
  }

  array(allowOps) {
    this.enter();
    const out = [];
    for (let guard = 0; guard < 1e6; guard += 1) {
      const item = this.token(allowOps);
      if (item === END_ARRAY || item === EOF) break;
      if (item === END_DICT) continue;
      out.push(item);
    }
    this.depth -= 1;
    return out;
  }

  dict(allowOps) {
    this.enter();
    const out = new Dict();
    for (let guard = 0; guard < 1e6; guard += 1) {
      const key = this.token(allowOps);
      if (key === END_DICT || key === EOF) break;
      if (!(key instanceof Name)) continue;
      const value = this.token(allowOps);
      if (value === END_DICT || value === EOF) break;
      out.map.set(key.name, value);
    }
    this.depth -= 1;
    return out;
  }

  value() {
    const item = this.token(false);
    return item === EOF || item === END_ARRAY || item === END_DICT || item instanceof Op ? null : item;
  }
}

class Budget {
  constructor(limits) {
    this.limits = limits;
    this.deadline = Date.now() + limits.maxMs;
    this.inflated = 0;
    this.ticks = 0;
  }
  tick() {
    this.ticks += 1;
    if ((this.ticks & 1023) === 0 && Date.now() > this.deadline) throw new PdfStop('PDF_TIMEOUT');
  }
  spend(bytes) {
    this.inflated += bytes;
    if (this.inflated > this.limits.maxTotalInflated) throw new PdfStop('PDF_TOO_LARGE');
  }
}

function rc4(key, data) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) s[i] = i;
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

function aesDecrypt(bits, key, data) {
  if (data.length < 32 || data.length % 16) return Buffer.alloc(0);
  try {
    const decipher = createDecipheriv(`aes-${bits}-cbc`, key, data.subarray(0, 16));
    return Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]);
  } catch {
    return Buffer.alloc(0);
  }
}

const PAD = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');

const bytesOf = (value) => (value instanceof Str ? value.bytes : Buffer.alloc(0));

function hashR6(password, salt, userKey) {
  let k = createHash('sha256').update(Buffer.concat([password, salt, userKey])).digest();
  let e = Buffer.alloc(0);
  for (let round = 0; (round < 64 || e[e.length - 1] > round - 32) && round < 2048; round += 1) {
    const unit = Buffer.concat([password, k, userKey]);
    const cipher = createCipheriv('aes-128-cbc', k.subarray(0, 16), k.subarray(16, 32));
    cipher.setAutoPadding(false);
    e = Buffer.concat([cipher.update(Buffer.concat(Array(64).fill(unit))), cipher.final()]);
    let sum = 0;
    for (let i = 0; i < 16; i += 1) sum += e[i];
    k = createHash(['sha256', 'sha384', 'sha512'][sum % 3]).update(e).digest();
  }
  return k.subarray(0, 32);
}

function securityHandler(encrypt, idFirst) {
  if (!(encrypt instanceof Dict)) return null;
  const filter = encrypt.get('Filter');
  if (!(filter instanceof Name) || filter.name !== 'Standard') throw new PdfStop('PDF_ENCRYPTED');
  const v = Number(encrypt.get('V') || 0);
  const r = Number(encrypt.get('R') || 0);
  const o = bytesOf(encrypt.get('O'));
  const u = bytesOf(encrypt.get('U'));
  const p = Number(encrypt.get('P') || 0);
  let method = 'rc4';
  let stringMethod = 'rc4';
  if (v >= 4) {
    const cf = encrypt.get('CF');
    const pick = (key) => {
      const name = encrypt.get(key);
      if (name instanceof Name && name.name === 'Identity') return 'identity';
      const entry = cf instanceof Dict && name instanceof Name ? cf.get(name.name) : null;
      const cfm = entry instanceof Dict ? entry.get('CFM') : null;
      const kind = cfm instanceof Name ? cfm.name : 'None';
      return kind === 'AESV2' ? 'aes128' : kind === 'AESV3' ? 'aes256' : kind === 'V2' ? 'rc4' : 'identity';
    };
    method = pick('StmF');
    stringMethod = pick('StrF');
  }
  if (r >= 5) {
    if (u.length < 48) throw new PdfStop('PDF_ENCRYPTED');
    const empty = Buffer.alloc(0);
    const check = r === 5 ? createHash('sha256').update(u.subarray(32, 40)).digest() : hashR6(empty, u.subarray(32, 40), empty);
    if (!check.equals(u.subarray(0, 32))) throw new PdfStop('PDF_PASSWORD_REQUIRED');
    const inter = r === 5 ? createHash('sha256').update(u.subarray(40, 48)).digest() : hashR6(empty, u.subarray(40, 48), empty);
    const ue = bytesOf(encrypt.get('UE'));
    if (ue.length < 32) throw new PdfStop('PDF_ENCRYPTED');
    const decipher = createDecipheriv('aes-256-cbc', inter, Buffer.alloc(16));
    decipher.setAutoPadding(false);
    const key = Buffer.concat([decipher.update(ue.subarray(0, 32)), decipher.final()]);
    return { key, method, stringMethod, r };
  }
  const length = v === 1 ? 5 : Math.max(5, Math.min(16, Number(encrypt.get('Length') || 40) / 8));
  const pBytes = Buffer.alloc(4);
  pBytes.writeInt32LE(p | 0);
  const parts = [PAD, o.subarray(0, 32), pBytes, idFirst];
  if (r >= 4 && encrypt.get('EncryptMetadata') === false) parts.push(Buffer.from([255, 255, 255, 255]));
  let key = createHash('md5').update(Buffer.concat(parts)).digest();
  if (r >= 3) for (let i = 0; i < 50; i += 1) key = createHash('md5').update(key.subarray(0, length)).digest();
  key = key.subarray(0, length);
  let ok;
  if (r === 2) ok = rc4(key, PAD).equals(u.subarray(0, 32));
  else {
    let x = rc4(key, createHash('md5').update(Buffer.concat([PAD, idFirst])).digest());
    for (let i = 1; i <= 19; i += 1) x = rc4(Buffer.from(key.map((b) => b ^ i)), x);
    ok = x.equals(u.subarray(0, 16));
  }
  if (!ok) throw new PdfStop('PDF_PASSWORD_REQUIRED');
  return { key, method, stringMethod, r };
}

function objectKey(handler, num, gen, aes) {
  if (handler.r >= 5) return handler.key;
  const extra = Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]);
  const hash = createHash('md5').update(Buffer.concat([handler.key, extra, aes ? Buffer.from('sAlT') : Buffer.alloc(0)])).digest();
  return hash.subarray(0, Math.min(handler.key.length + 5, 16));
}

function decryptBytes(handler, method, num, gen, data) {
  if (!handler || method === 'identity') return data;
  if (method === 'rc4') return rc4(objectKey(handler, num, gen, false), data);
  if (method === 'aes128') return aesDecrypt(128, objectKey(handler, num, gen, true), data);
  return aesDecrypt(256, handler.key, data);
}

function decryptStrings(handler, value, num, gen, depth = 0) {
  if (depth > 32) return value;
  if (value instanceof Str) return new Str(decryptBytes(handler, handler.stringMethod, num, gen, value.bytes));
  if (Array.isArray(value)) return value.map((item) => decryptStrings(handler, item, num, gen, depth + 1));
  if (value instanceof Dict) {
    const out = new Dict();
    for (const [key, item] of value.map) out.map.set(key, decryptStrings(handler, item, num, gen, depth + 1));
    return out;
  }
  return value;
}

function unpredict(data, params) {
  if (!(params instanceof Dict)) return data;
  const predictor = Number(params.get('Predictor') || 1);
  if (predictor < 10) return data;
  const colors = Number(params.get('Colors') || 1);
  const bpc = Number(params.get('BitsPerComponent') || 8);
  const columns = Number(params.get('Columns') || 1);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLength = Math.ceil((colors * bpc * columns) / 8);
  if (!rowLength || rowLength > 1e6) return data;
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = Buffer.alloc(rows * rowLength);
  let prev = Buffer.alloc(rowLength);
  for (let row = 0; row < rows; row += 1) {
    const base = row * (rowLength + 1);
    const type = data[base];
    const line = Buffer.from(data.subarray(base + 1, base + 1 + rowLength));
    for (let i = 0; i < rowLength; i += 1) {
      const left = i >= bpp ? line[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      if (type === 1) line[i] = (line[i] + left) & 255;
      else if (type === 2) line[i] = (line[i] + up) & 255;
      else if (type === 3) line[i] = (line[i] + ((left + up) >> 1)) & 255;
      else if (type === 4) {
        const pa = Math.abs(up - upLeft);
        const pb = Math.abs(left - upLeft);
        const pc = Math.abs(left + up - 2 * upLeft);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      }
    }
    line.copy(out, row * rowLength);
    prev = line;
  }
  return out;
}

function ascii85(data) {
  const text = data.toString('latin1').replace(/\s+/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
  const out = [];
  let group = [];
  for (const ch of text) {
    if (ch === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    const code = ch.charCodeAt(0) - 33;
    if (code < 0 || code > 84) continue;
    group.push(code);
    if (group.length === 5) {
      let value = 0;
      for (const digit of group) value = value * 85 + digit;
      out.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
      group = [];
    }
  }
  if (group.length > 1) {
    const size = group.length;
    while (group.length < 5) group.push(84);
    let value = 0;
    for (const digit of group) value = value * 85 + digit;
    const bytes = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
    out.push(...bytes.slice(0, size - 1));
  }
  return Buffer.from(out);
}

class Document {
  constructor(buf, limits) {
    this.buf = buf;
    this.limits = limits;
    this.budget = new Budget(limits);
    this.objects = new Map();
    this.trailers = [];
    this.handler = null;
    this.decoded = new Map();
  }

  scan() {
    const text = this.buf.toString('latin1');
    const pattern = /(\d+)\s+(\d+)\s+obj\b/g;
    const candidates = [];
    let match;
    while ((match = pattern.exec(text))) {
      this.budget.tick();
      if (candidates.length > this.limits.maxObjects) throw new PdfStop('PDF_TOO_MANY_OBJECTS');
      const num = Number(match[1]);
      const gen = Number(match[2]);
      const lexer = new Lexer(this.buf, match.index + match[0].length, this.buf.length, this.budget);
      let value;
      try {
        value = lexer.value();
      } catch {
        continue;
      }
      lexer.skip();
      let end = lexer.pos;
      if (value instanceof Dict && text.startsWith('stream', lexer.pos)) {
        let start = lexer.pos + 6;
        if (this.buf[start] === 13) start += 1;
        if (this.buf[start] === 10) start += 1;
        const declared = value.get('Length');
        let stop = -1;
        if (typeof declared === 'number' && declared >= 0 && start + declared <= this.buf.length) {
          const after = new Lexer(this.buf, start + declared);
          after.skip();
          if (text.startsWith('endstream', after.pos)) stop = start + declared;
        }
        if (stop < 0) {
          const found = text.indexOf('endstream', start);
          stop = found < 0 ? this.buf.length : found;
          while (stop > start && (this.buf[stop - 1] === 10 || this.buf[stop - 1] === 13)) stop -= 1;
        }
        if (stop - start > this.limits.maxStreamBytes) throw new PdfStop('PDF_TOO_LARGE');
        value = new Stream(value, this.buf.subarray(start, stop), num, gen);
        end = stop;
        const type = value.dict.get('Type');
        if (type instanceof Name && type.name === 'XRef') this.trailers.push({ pos: match.index, dict: value.dict });
      }
      candidates.push({ num, gen, pos: match.index, value });
      pattern.lastIndex = Math.max(end, match.index + match[0].length);
    }
    const trailerPattern = /trailer\s*<</g;
    while ((match = trailerPattern.exec(text))) {
      const lexer = new Lexer(this.buf, match.index + 7);
      const dict = lexer.value();
      if (dict instanceof Dict) this.trailers.push({ pos: match.index, dict });
    }
    this.trailers.sort((a, b) => a.pos - b.pos);
    for (const item of candidates) this.place(item);
    const encrypt = this.trailerValue('Encrypt');
    if (encrypt != null) {
      const ids = this.trailerValue('ID');
      const idFirst = Array.isArray(ids) ? bytesOf(this.resolve(ids[0])) : Buffer.alloc(0);
      const encryptDict = this.resolve(encrypt);
      this.handler = securityHandler(encryptDict, idFirst);
      const skip = encrypt instanceof Ref ? encrypt.num : -1;
      for (const [num, entry] of this.objects) {
        if (num === skip || entry.value instanceof Stream) continue;
        entry.value = decryptStrings(this.handler, entry.value, num, entry.gen);
      }
      for (const entry of this.objects.values()) {
        if (entry.value instanceof Stream && entry.value.num !== skip) entry.value.dict = decryptStrings(this.handler, entry.value.dict, entry.value.num, entry.value.gen);
      }
    }
    for (const item of candidates) {
      const stream = item.value;
      if (!(stream instanceof Stream)) continue;
      const type = stream.dict.get('Type');
      if (!(type instanceof Name) || type.name !== 'ObjStm') continue;
      this.unpack(stream, item.pos);
    }
  }

  place({ num, gen, pos, value }) {
    const current = this.objects.get(num);
    if (!current || current.pos <= pos) this.objects.set(num, { gen, pos, value });
  }

  unpack(stream, pos) {
    let data;
    try {
      data = this.decode(stream);
    } catch (err) {
      if (err instanceof PdfStop) throw err;
      return;
    }
    const count = Math.min(Number(this.resolve(stream.dict.get('N')) || 0), this.limits.maxObjects);
    const first = Number(this.resolve(stream.dict.get('First')) || 0);
    const header = new Lexer(data, 0, Math.min(first, data.length));
    const pairs = [];
    for (let i = 0; i < count; i += 1) {
      const num = header.token(true);
      const offset = header.token(true);
      if (typeof num !== 'number' || typeof offset !== 'number') break;
      pairs.push([num, offset]);
    }
    for (let i = 0; i < pairs.length; i += 1) {
      this.budget.tick();
      const [num, offset] = pairs[i];
      const start = first + offset;
      const end = i + 1 < pairs.length ? first + pairs[i + 1][1] : data.length;
      if (start < 0 || start >= data.length) continue;
      const lexer = new Lexer(data, start, Math.max(start, Math.min(end, data.length)));
      let value;
      try {
        value = lexer.value();
      } catch {
        continue;
      }
      const current = this.objects.get(num);
      if (current && current.pos > pos) continue;
      this.objects.set(num, { gen: 0, pos: pos + 0.5, value });
    }
  }

  trailerValue(key) {
    for (let i = this.trailers.length - 1; i >= 0; i -= 1) {
      const value = this.trailers[i].dict.get(key);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  resolve(value, depth = 0) {
    let current = value;
    for (let hop = 0; current instanceof Ref && hop < 32; hop += 1) {
      const entry = this.objects.get(current.num);
      current = entry ? entry.value : null;
    }
    return current instanceof Ref ? null : current;
  }

  get(dict, key) {
    if (dict instanceof Stream) return this.resolve(dict.dict.get(key));
    if (dict instanceof Dict) return this.resolve(dict.get(key));
    return undefined;
  }

  decode(stream) {
    if (this.decoded.has(stream)) return this.decoded.get(stream);
    this.budget.tick();
    let data = stream.raw;
    if (this.handler && stream.num != null) {
      const type = this.get(stream, 'Type');
      if (!(type instanceof Name && type.name === 'XRef')) data = decryptBytes(this.handler, this.handler.method, stream.num, stream.gen, data);
    }
    const filters = [this.get(stream, 'Filter')].flat().map((item) => this.resolve(item)).filter((item) => item instanceof Name);
    const params = [this.get(stream, 'DecodeParms')].flat().map((item) => this.resolve(item));
    for (let i = 0; i < filters.length; i += 1) {
      const name = filters[i].name;
      if (name === 'FlateDecode' || name === 'Fl') {
        const room = Math.max(0, Math.min(this.limits.maxStreamBytes, this.limits.maxTotalInflated - this.budget.inflated));
        try {
          data = inflateSync(data, { maxOutputLength: Math.max(1, room), finishFlush: zlibConstants.Z_SYNC_FLUSH });
        } catch (err) {
          if (err && err.code === 'ERR_BUFFER_TOO_LARGE') throw new PdfStop('PDF_TOO_LARGE');
          throw err;
        }
        this.budget.spend(data.length);
        data = unpredict(data, params[i]);
      } else if (name === 'ASCIIHexDecode' || name === 'AHx') {
        data = Buffer.from(data.toString('latin1').replace(/>.*$/s, '').replace(/[^0-9a-fA-F]/g, '').replace(/^(.(..)*)$/, '$10'), 'hex');
      } else if (name === 'ASCII85Decode' || name === 'A85') {
        data = ascii85(data);
      } else {
        throw new Error('UNSUPPORTED_FILTER');
      }
    }
    this.decoded.set(stream, data);
    return data;
  }

  root() {
    const root = this.resolve(this.trailerValue('Root'));
    if (root instanceof Dict) return root;
    for (const entry of this.objects.values()) {
      const type = entry.value instanceof Dict ? entry.value.get('Type') : null;
      if (type instanceof Name && type.name === 'Catalog') return entry.value;
    }
    return null;
  }
}

function utf16be(bytes) {
  const swapped = Buffer.alloc(bytes.length - (bytes.length % 2));
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return swapped.toString('utf16le');
}

const PDF_DOC_HIGH = { 0x80: '•', 0x81: '†', 0x82: '‡', 0x83: '…', 0x84: '—', 0x85: '–', 0x86: 'ƒ', 0x87: '⁄', 0x88: '‹', 0x89: '›', 0x8a: '−', 0x8d: '“', 0x8e: '”', 0x8f: '‘', 0x90: '’', 0x91: '‚', 0x92: '™' };

export function textString(value) {
  const bytes = value instanceof Str ? value.bytes : null;
  if (!bytes) return typeof value === 'number' ? String(value) : value instanceof Name ? value.name : '';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16be(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3).toString('utf8');
  let out = '';
  for (const b of bytes) out += PDF_DOC_HIGH[b] || String.fromCharCode(b);
  return out;
}

const WIN_ANSI_HIGH = { 0x80: '€', 0x82: '‚', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x89: '‰', 0x8b: '‹', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x99: '™', 0x9b: '›', 0xa0: ' ', 0xad: '-' };

const GLYPHS = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'", quoteright: '’', quoteleft: '‘', parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', minus: '-', period: '.', slash: '/',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@',
  bracketleft: '[', backslash: '\\', bracketright: ']', underscore: '_', braceleft: '{', bar: '|', braceright: '}', bullet: '•', endash: '–', emdash: '—', quotedblleft: '“', quotedblright: '”', section: '§', fi: 'fi', fl: 'fl', nbspace: ' ', ellipsis: '…',
};

function glyphText(name) {
  if (Object.hasOwn(GLYPHS, name)) return GLYPHS[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  const uni = /^uni([0-9A-Fa-f]{4})/.exec(name) || /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (uni) return String.fromCodePoint(parseInt(uni[1], 16));
  return '';
}

function parseCmap(data, budget) {
  const lexer = new Lexer(data);
  const map = new Map();
  const ranges = [];
  let codeBytes = 1;
  const stack = [];
  const hexOf = (str) => str.bytes;
  const unicode = (bytes) => utf16be(bytes);
  for (let guard = 0; guard < 2e5; guard += 1) {
    budget.tick();
    const item = lexer.token(true);
    if (item === EOF) break;
    if (!(item instanceof Op)) {
      stack.push(item);
      if (stack.length > 4096) stack.shift();
      continue;
    }
    if (item.op === 'begincodespacerange' || item.op === 'beginbfchar' || item.op === 'beginbfrange') stack.length = 0;
    else if (item.op === 'endcodespacerange') {
      const first = stack.find((value) => value instanceof Str);
      if (first) codeBytes = Math.max(1, Math.min(4, first.bytes.length));
      stack.length = 0;
    } else if (item.op === 'endbfchar') {
      for (let i = 0; i + 1 < stack.length; i += 2) {
        if (stack[i] instanceof Str && stack[i + 1] instanceof Str) map.set(hexOf(stack[i]).toString('hex'), unicode(stack[i + 1].bytes));
        else if (stack[i] instanceof Str && stack[i + 1] instanceof Name) map.set(hexOf(stack[i]).toString('hex'), glyphText(stack[i + 1].name));
      }
      stack.length = 0;
    } else if (item.op === 'endbfrange') {
      for (let i = 0; i + 2 < stack.length; i += 3) {
        const [lo, hi, dst] = [stack[i], stack[i + 1], stack[i + 2]];
        if (!(lo instanceof Str) || !(hi instanceof Str)) continue;
        const low = parseInt(lo.bytes.toString('hex') || '0', 16);
        const high = parseInt(hi.bytes.toString('hex') || '0', 16);
        if (!(high >= low) || high - low > 65535) continue;
        ranges.push({ low, high, width: lo.bytes.length, dst });
      }
      stack.length = 0;
    } else stack.length = 0;
  }
  return { codeBytes, map, ranges };
}

function cmapLookup(cmap, code, width) {
  const key = code.toString(16).padStart(width * 2, '0');
  if (cmap.map.has(key)) return cmap.map.get(key);
  for (const range of cmap.ranges) {
    if (range.width !== width || code < range.low || code > range.high) continue;
    const offset = code - range.low;
    if (Array.isArray(range.dst)) return range.dst[offset] instanceof Str ? utf16be(range.dst[offset].bytes) : '';
    if (range.dst instanceof Str) {
      const bytes = Buffer.from(range.dst.bytes);
      if (bytes.length >= 2) {
        const last = bytes.readUInt16BE(bytes.length - 2) + offset;
        bytes.writeUInt16BE(last & 0xffff, bytes.length - 2);
      }
      return utf16be(bytes);
    }
  }
  return null;
}

function numberOf(doc, value, fallback) {
  const resolved = doc.resolve(value);
  return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : fallback;
}

function simpleWidths(doc, font) {
  const first = numberOf(doc, doc.get(font, 'FirstChar'), 0);
  const widths = doc.get(font, 'Widths');
  const descriptor = doc.get(font, 'FontDescriptor');
  const missing = numberOf(doc, descriptor instanceof Dict ? descriptor.get('MissingWidth') : undefined, 0) || 500;
  const list = Array.isArray(widths) ? widths.map((item) => numberOf(doc, item, missing)) : [];
  return (code) => (code >= first && code - first < list.length ? list[code - first] : missing);
}

function compositeWidths(doc, font) {
  const descendants = doc.get(font, 'DescendantFonts');
  const cid = Array.isArray(descendants) ? doc.resolve(descendants[0]) : null;
  const fallback = numberOf(doc, cid instanceof Dict ? cid.get('DW') : undefined, 1000);
  const table = new Map();
  const ranges = [];
  const w = cid instanceof Dict ? doc.get(cid, 'W') : null;
  if (Array.isArray(w)) {
    for (let i = 0; i < w.length && i < 100000;) {
      const startCode = numberOf(doc, w[i], null);
      const next = doc.resolve(w[i + 1]);
      if (startCode === null) break;
      if (Array.isArray(next)) {
        next.forEach((item, offset) => table.set(startCode + offset, numberOf(doc, item, fallback)));
        i += 2;
      } else {
        ranges.push([startCode, numberOf(doc, next, startCode), numberOf(doc, w[i + 2], fallback)]);
        i += 3;
      }
    }
  }
  return (code) => {
    if (table.has(code)) return table.get(code);
    for (const [low, high, width] of ranges) if (code >= low && code <= high) return width;
    return fallback;
  };
}

function fontDecoder(doc, font) {
  const plain = (b) => WIN_ANSI_HIGH[b] || (b >= 32 ? String.fromCharCode(b) : '');
  if (!(font instanceof Dict)) return (bytes) => [...bytes].map((b) => ({ text: plain(b), width: 500, space: b === 32 }));
  const subtype = doc.get(font, 'Subtype');
  const composite = subtype instanceof Name && subtype.name === 'Type0';
  const toUnicode = doc.get(font, 'ToUnicode');
  let cmap = null;
  if (toUnicode instanceof Stream) {
    try {
      cmap = parseCmap(doc.decode(toUnicode), doc.budget);
    } catch (err) {
      if (err instanceof PdfStop) throw err;
    }
  }
  if (composite) {
    const size = cmap ? Math.max(cmap.codeBytes, 2) : 2;
    const widthOf = compositeWidths(doc, font);
    return (bytes) => {
      const out = [];
      for (let i = 0; i + size <= bytes.length; i += size) {
        const code = bytes.readUIntBE(i, size);
        const text = cmap ? cmapLookup(cmap, code, size) : null;
        out.push({ text: text || '', width: widthOf(code), space: false });
      }
      return out;
    };
  }
  const differences = new Map();
  const encoding = doc.get(font, 'Encoding');
  if (encoding instanceof Dict) {
    const diffs = doc.get(encoding, 'Differences');
    if (Array.isArray(diffs)) {
      let code = 0;
      for (const item of diffs) {
        const value = doc.resolve(item);
        if (typeof value === 'number') code = value;
        else if (value instanceof Name) {
          differences.set(code, glyphText(value.name));
          code += 1;
        }
      }
    }
  }
  const widthOf = simpleWidths(doc, font);
  return (bytes) => [...bytes].map((b) => {
    const mapped = cmap ? cmapLookup(cmap, b, 1) : null;
    const text = mapped != null ? mapped : differences.has(b) ? differences.get(b) : plain(b);
    return { text, width: widthOf(b), space: b === 32 };
  });
}

const multiply = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

const IDENTITY = [1, 0, 0, 1, 0, 0];

function inheritable(doc, page, key) {
  let node = page;
  for (let depth = 0; node instanceof Dict && depth < 64; depth += 1) {
    const value = doc.get(node, key);
    if (value !== undefined && value !== null) return value;
    node = doc.get(node, 'Parent');
  }
  return null;
}

function collectPages(doc) {
  const out = [];
  const seen = new Set();
  const root = doc.root();
  const walk = (node, depth) => {
    if (!(node instanceof Dict) || seen.has(node) || depth > doc.limits.maxDepth) return;
    seen.add(node);
    doc.budget.tick();
    const kids = doc.get(node, 'Kids');
    const type = doc.get(node, 'Type');
    if (Array.isArray(kids) && !(type instanceof Name && type.name === 'Page')) {
      for (const kid of kids) {
        if (out.length >= doc.limits.maxPages) return;
        walk(doc.resolve(kid), depth + 1);
      }
    } else out.push(node);
  };
  walk(root ? doc.get(root, 'Pages') : null, 0);
  if (!out.length) {
    for (const entry of doc.objects.values()) {
      const type = entry.value instanceof Dict ? entry.value.get('Type') : null;
      if (type instanceof Name && type.name === 'Page' && out.length < doc.limits.maxPages) out.push(entry.value);
    }
  }
  return out;
}

function runContent(doc, data, resources, ctm, runs, pageIndex, depth, seenForms) {
  if (depth > 8) return;
  const lexer = new Lexer(data, 0, data.length, doc.budget);
  const fonts = new Map();
  const fontOf = (name) => {
    if (fonts.has(name)) return fonts.get(name);
    const dict = doc.get(resources, 'Font');
    const decoder = fontDecoder(doc, dict ? doc.get(dict, name) : null);
    fonts.set(name, decoder);
    return decoder;
  };
  let gs = { ctm, font: null, size: 1, leading: 0, charSpace: 0, wordSpace: 0, scale: 1 };
  const stack = [];
  let tm = IDENTITY;
  let tlm = IDENTITY;
  let operands = [];
  const plainFont = fontDecoder(doc, null);
  const show = (items) => {
    const m = multiply(tm, gs.ctm);
    let text = '';
    let advance = 0;
    for (const item of items) {
      if (typeof item === 'number') {
        const shift = (-item / 1000) * gs.size * gs.scale;
        if (-item / 1000 > 0.2 && text && !text.endsWith(' ')) text += ' ';
        advance += shift;
        continue;
      }
      if (!(item instanceof Str)) continue;
      for (const glyph of (gs.font || plainFont)(item.bytes)) {
        text += glyph.text;
        advance += ((glyph.width / 1000) * gs.size + gs.charSpace + (glyph.space ? gs.wordSpace : 0)) * gs.scale;
      }
    }
    const end = multiply([1, 0, 0, 1, advance, 0], m);
    tm = multiply([1, 0, 0, 1, advance, 0], tm);
    if (!text || runs.length >= doc.limits.maxRuns) return;
    const size = Math.abs(gs.size * (Math.hypot(m[2], m[3]) || 1));
    runs.push({ page: pageIndex, x: m[4], y: m[5], end: end[4], size, text });
  };
  const nextLine = (tx, ty) => {
    tlm = multiply([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };
  for (let guard = 0; guard < 5e6; guard += 1) {
    doc.budget.tick();
    const item = lexer.token(true);
    if (item === EOF) break;
    if (!(item instanceof Op)) {
      operands.push(item);
      if (operands.length > 64) operands.shift();
      continue;
    }
    const n = (i) => (typeof operands[i] === 'number' ? operands[i] : 0);
    switch (item.op) {
      case 'q': stack.push(gs); gs = { ...gs }; if (stack.length > 64) stack.shift(); break;
      case 'Q': gs = stack.pop() || gs; break;
      case 'cm': gs.ctm = multiply([n(0), n(1), n(2), n(3), n(4), n(5)], gs.ctm); break;
      case 'BT': tm = IDENTITY; tlm = IDENTITY; break;
      case 'Tf': gs.font = operands[0] instanceof Name ? fontOf(operands[0].name) : null; gs.size = n(1) || 1; break;
      case 'TL': gs.leading = n(0); break;
      case 'Tm': tlm = [n(0), n(1), n(2), n(3), n(4), n(5)]; tm = tlm; break;
      case 'Td': nextLine(n(0), n(1)); break;
      case 'TD': gs.leading = -n(1); nextLine(n(0), n(1)); break;
      case 'T*': nextLine(0, -gs.leading); break;
      case 'Tc': gs.charSpace = n(0); break;
      case 'Tw': gs.wordSpace = n(0); break;
      case 'Tz': gs.scale = n(0) / 100; break;
      case 'Tj': show([operands[0]]); break;
      case "'": nextLine(0, -gs.leading); show([operands[0]]); break;
      case '"': gs.wordSpace = n(0); gs.charSpace = n(1); nextLine(0, -gs.leading); show([operands[2]]); break;
      case 'TJ': show(Array.isArray(operands[0]) ? operands[0] : []); break;
      case 'ID': {
        const at = data.indexOf('EI', lexer.pos, 'latin1');
        let probe = at;
        while (probe >= 0 && !((isWhite(data[probe - 1])) && (probe + 2 >= data.length || isWhite(data[probe + 2])))) probe = data.indexOf('EI', probe + 2, 'latin1');
        lexer.pos = probe < 0 ? data.length : probe + 2;
        break;
      }
      case 'Do': {
        const xobjects = doc.get(resources, 'XObject');
        const form = xobjects && operands[0] instanceof Name ? doc.get(xobjects, operands[0].name) : null;
        const subtype = form instanceof Stream ? doc.get(form, 'Subtype') : null;
        if (form instanceof Stream && subtype instanceof Name && subtype.name === 'Form' && !seenForms.has(form)) {
          seenForms.add(form);
          const matrix = doc.get(form, 'Matrix');
          const m = Array.isArray(matrix) && matrix.length === 6 ? matrix.map((v) => Number(doc.resolve(v)) || 0) : IDENTITY;
          try {
            runContent(doc, doc.decode(form), doc.get(form, 'Resources') || resources, multiply(m, gs.ctm), runs, pageIndex, depth + 1, seenForms);
          } catch (err) {
            if (err instanceof PdfStop) throw err;
          }
          seenForms.delete(form);
        }
        break;
      }
      default: break;
    }
    operands = [];
  }
}

function pageLines(runs) {
  const byPage = new Map();
  for (const run of runs) {
    if (!byPage.has(run.page)) byPage.set(run.page, []);
    byPage.get(run.page).push(run);
  }
  const pages = [];
  for (const [page, items] of [...byPage].sort((a, b) => a[0] - b[0])) {
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const run of sorted) {
      const line = lines[lines.length - 1];
      const tolerance = Math.max(2, Math.min(run.size, line ? line.size : run.size) * 0.45);
      if (line && Math.abs(line.y - run.y) <= tolerance) {
        line.runs.push(run);
        line.size = Math.max(line.size, run.size);
      } else lines.push({ y: run.y, size: run.size, runs: [run] });
    }
    pages.push({
      page,
      lines: lines.map((line) => {
        const ordered = line.runs.sort((a, b) => a.x - b.x);
        const parts = ordered.map((run) => ({ x: Math.round(run.x * 10) / 10, text: run.text.replace(/\s+/g, ' ') }));
        let text = '';
        let previous = null;
        for (const run of ordered) {
          const piece = run.text.replace(/\s+/g, ' ');
          if (!piece.trim()) {
            if (text && !text.endsWith(' ')) text += ' ';
            previous = run;
            continue;
          }
          const gap = previous ? run.x - (Number.isFinite(previous.end) ? previous.end : previous.x + previous.text.length * previous.size * 0.5) : 0;
          const glued = previous && gap < Math.min(previous.size, run.size) * 0.15 && !/\s$/.test(previous.text);
          text += !text || glued || text.endsWith(' ') ? (text ? piece.replace(/^\s+/, '') : piece.trim()) : ` ${piece.trim()}`;
          previous = run;
        }
        return { y: Math.round(line.y * 10) / 10, parts, text: text.replace(/\s+/g, ' ').trim() };
      }).filter((line) => line.text),
    });
  }
  return pages;
}

function collectFields(doc) {
  const fields = [];
  const seen = new Set();
  const root = doc.root();
  const acro = root ? doc.get(root, 'AcroForm') : null;
  const pages = collectPages(doc);
  const pageOfWidget = new Map();
  pages.forEach((page, index) => {
    const annots = doc.get(page, 'Annots');
    if (Array.isArray(annots)) for (const item of annots) {
      const widget = doc.resolve(item);
      if (widget instanceof Dict) pageOfWidget.set(widget, index);
    }
  });
  const placeOf = (node, kids) => {
    const widget = doc.get(node, 'Rect') ? node : kids.find((kid) => doc.get(kid, 'Rect'));
    if (!widget) return {};
    const rect = doc.get(widget, 'Rect');
    const box = Array.isArray(rect) && rect.length === 4 ? rect.map((v) => Math.round((Number(doc.resolve(v)) || 0) * 10) / 10) : null;
    let page = pageOfWidget.get(widget);
    if (page === undefined) {
      const owner = doc.get(widget, 'P');
      const found = pages.indexOf(owner);
      if (found >= 0) page = found;
    }
    return { ...(page !== undefined ? { page } : {}), ...(box ? { rect: [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])] } : {}) };
  };
  const walk = (node, parentName, inherited, depth) => {
    if (!(node instanceof Dict) || seen.has(node) || depth > doc.limits.maxDepth || fields.length >= doc.limits.maxFields) return;
    seen.add(node);
    doc.budget.tick();
    const partial = doc.get(node, 'T');
    const name = partial instanceof Str ? (parentName ? `${parentName}.${textString(partial)}` : textString(partial)) : parentName;
    const value = doc.get(node, 'V');
    const tooltip = doc.get(node, 'TU');
    const type = doc.get(node, 'FT');
    const here = {
      value: value !== undefined && value !== null ? value : inherited.value,
      type: type instanceof Name ? type.name : inherited.type,
      tooltip: tooltip instanceof Str ? textString(tooltip) : inherited.tooltip,
    };
    const kids = doc.get(node, 'Kids');
    const named = Array.isArray(kids) ? kids.map((kid) => doc.resolve(kid)).filter((kid) => kid instanceof Dict) : [];
    const childFields = named.filter((kid) => doc.get(kid, 'T') instanceof Str);
    if (childFields.length) for (const kid of childFields) walk(kid, name, { ...here, tooltip: '' }, depth + 1);
    if (!childFields.length && name) {
      let text = '';
      if (here.value instanceof Str) text = textString(here.value);
      else if (here.value instanceof Name) text = here.value.name === 'Off' ? '' : here.value.name;
      else if (typeof here.value === 'number') text = String(here.value);
      else if (Array.isArray(here.value)) text = here.value.map((item) => textString(doc.resolve(item))).join(', ');
      fields.push({ name, value: text, type: here.type || '', tooltip: here.tooltip || '', ...placeOf(node, named) });
    }
  };
  const top = acro ? doc.get(acro, 'Fields') : null;
  if (Array.isArray(top)) for (const item of top) walk(doc.resolve(item), '', { value: undefined, type: '', tooltip: '' }, 0);
  if (!fields.length) {
    for (const page of pages) {
      const annots = doc.get(page, 'Annots');
      if (!Array.isArray(annots)) continue;
      for (const item of annots) {
        let node = doc.resolve(item);
        for (let up = 0; node instanceof Dict && up < 16; up += 1) {
          const parent = doc.get(node, 'Parent');
          if (!(parent instanceof Dict)) break;
          node = parent;
        }
        if (node instanceof Dict && doc.get(node, 'T') instanceof Str) walk(node, '', { value: undefined, type: '', tooltip: '' }, 0);
      }
    }
  }
  return fields;
}

export function pdfBytesOf(content) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  const text = String(content ?? '');
  const match = /^data:application\/pdf(?:;[^,;]*)*;base64,/i.exec(text.slice(0, 200));
  if (match) return Buffer.from(text.slice(match[0].length).replace(/\s+/g, ''), 'base64');
  const start = text.indexOf('%PDF-');
  if (start >= 0 && start < 1024) return Buffer.from(text.slice(start), 'latin1');
  if (/^[A-Za-z0-9+/=\s]{40,}$/.test(text.slice(0, 400))) {
    const bytes = Buffer.from(text.replace(/\s+/g, ''), 'base64');
    if (bytes.subarray(0, 1024).includes('%PDF-')) return bytes;
  }
  return null;
}

export function readPdf(content, options = {}) {
  const limits = { ...PDF_LIMITS, ...options };
  try {
    const buf = pdfBytesOf(content);
    if (!buf || !buf.length) return { ok: false, error: 'NOT_A_PDF' };
    if (buf.length > limits.maxBytes) return { ok: false, error: 'PDF_TOO_LARGE' };
    const head = buf.indexOf('%PDF-');
    if (head < 0 || head > 1024) return { ok: false, error: 'NOT_A_PDF' };
    const doc = new Document(buf, limits);
    doc.scan();
    if (!doc.objects.size) return { ok: false, error: 'PDF_UNREADABLE' };
    const fields = collectFields(doc);
    const runs = [];
    const pages = collectPages(doc);
    pages.forEach((page, index) => {
      const contents = doc.get(page, 'Contents');
      const streams = (Array.isArray(contents) ? contents.map((item) => doc.resolve(item)) : [contents]).filter((item) => item instanceof Stream);
      const chunks = [];
      for (const stream of streams) {
        try {
          chunks.push(doc.decode(stream), Buffer.from('\n'));
        } catch (err) {
          if (err instanceof PdfStop) throw err;
        }
      }
      const resources = inheritable(doc, page, 'Resources');
      try {
        runContent(doc, Buffer.concat(chunks), resources, IDENTITY, runs, index, 0, new Set());
      } catch (err) {
        if (err instanceof PdfStop) throw err;
      }
    });
    const info = doc.resolve(doc.trailerValue('Info'));
    const producer = info instanceof Dict ? textString(doc.resolve(info.get('Producer'))) : '';
    const creator = info instanceof Dict ? textString(doc.resolve(info.get('Creator'))) : '';
    return { ok: true, pageCount: pages.length, pages: pageLines(runs), fields, producer: producer.slice(0, 120), creator: creator.slice(0, 120), encrypted: Boolean(doc.handler) };
  } catch (err) {
    if (err instanceof PdfStop) return { ok: false, error: err.code };
    return { ok: false, error: 'PDF_UNREADABLE' };
  }
}
