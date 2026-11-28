import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadDataRecords(dir) {
  if (!existsSync(dir)) return [];
  const records = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.json')).sort()) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (err) {
      throw new Error(`The rules file ${name} is not valid JSON: ${err.message}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`The rules file ${name} must hold a list of records.`);
    records.push(...parsed);
  }
  return records;
}
