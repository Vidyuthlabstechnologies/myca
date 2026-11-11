import { crc32 } from 'node:zlib';

const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

function u16(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
}

export function storeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(String(entry.name), 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const crc = crc32(data);
    const common = Buffer.concat([u16(20), u16(0x0800), u16(0), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)]);
    const local = Buffer.concat([u32(0x04034b50), common, name, data]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);
  return Buffer.concat([...locals, central, end]);
}

export function readStoreZip(buffer) {
  const out = [];
  let at = 0;
  while (at + 30 <= buffer.length && buffer.readUInt32LE(at) === 0x04034b50) {
    const size = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const extra = buffer.readUInt16LE(at + 28);
    const name = buffer.subarray(at + 30, at + 30 + nameLength).toString('utf8');
    const start = at + 30 + nameLength + extra;
    out.push({ name, data: buffer.subarray(start, start + size) });
    at = start + size;
  }
  return out;
}

export function submissionZip(submission) {
  return storeZip([
    { name: 'manifest/manifest.xml', data: submission.manifest },
    { name: 'xml/submission.xml', data: submission.xml },
  ]);
}

export function transmissionZip(submissions) {
  return storeZip(submissions.map((submission) => ({ name: `${submission.submissionId}.zip`, data: submissionZip(submission) })));
}
