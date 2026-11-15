import test from 'node:test';
import assert from 'node:assert/strict';
import { malaysiaCp39 } from '../src/countries/malaysia/cp39.mjs';
import { ENGINE } from '../src/countries/malaysia/engine.mjs';
import { MANIFEST } from '../src/countries/malaysia/manifest.mjs';
import { rules } from '../src/sprint-load.mjs';

const staff = [
  { name: 'Aminah binti Yusof', taxNumber: 'IG 531367080', newIc: '880402-10-5566', pcb: 900, employeeNo: 'E001' },
  { name: 'Rahul Menon', taxNumber: '12345678901', passport: 'Z1234567', countryCode: 'in', pcb: 1500.5, cp38: 200, employeeNo: 'E002' },
  { name: 'Tan Mei Ling', taxNumber: 'IG22334455667', newIc: '950101145678', pcb: 0 },
];

test('the CP39 file follows LHDN\'s header and detail layout position by position', () => {
  const out = malaysiaCp39({ month: '2026-10', employerNo: 'E 9012345678', employees: staff });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.fileName, '901234567810_2026.txt');
  const lines = out.data.content.split('\r\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[3], '');
  const [header, first, second] = lines;
  assert.equal(header.length, 57);
  assert.equal(header, `H${'9012345678'}${'9012345678'}${'2026'}${'10'}${'0000240050'}${'00002'}${'0000020000'}${'00001'}`);
  assert.equal(first.length, 136);
  assert.equal(first.slice(0, 1), 'D');
  assert.equal(first.slice(1, 12), '00531367080');
  assert.equal(first.slice(12, 72), 'Aminah binti Yusof'.padEnd(60, ' '));
  assert.equal(first.slice(72, 84), ' '.repeat(12));
  assert.equal(first.slice(84, 96), '880402105566');
  assert.equal(first.slice(96, 108), ' '.repeat(12));
  assert.equal(first.slice(108, 110), '  ');
  assert.equal(first.slice(110, 118), '00090000');
  assert.equal(first.slice(118, 126), '00000000');
  assert.equal(first.slice(126, 136), 'E001      ');
  assert.equal(second.slice(1, 12), '12345678901');
  assert.equal(second.slice(96, 108), 'Z1234567    ');
  assert.equal(second.slice(108, 110), 'IN');
  assert.equal(second.slice(110, 118), '00150050');
  assert.equal(second.slice(118, 126), '00020000');
  assert.deepEqual(out.data.totals, { pcb: 2400.5, pcbRecords: 2, cp38: 200, cp38Records: 1 });
  assert.deepEqual(out.data.leftOut, ['Tan Mei Ling']);
  assert.equal(out.data.dueBy, '2026-11-15');
  assert.equal(out.data.rulesUsed[0].id, 'my.payroll.cp39-text-file');
  assert.equal(malaysiaCp39({ month: '2026-12', employerNo: '77', hqEmployerNo: '55', employees: staff }).data.content.slice(0, 21), `H${'0000000055'}${'0000000077'}`);
  assert.equal(malaysiaCp39({ month: '2026-12', employerNo: '77', employees: staff }).data.dueBy, '2027-01-15');
});

test('the layout in the rule adds up to the record lengths LHDN gives', () => {
  const layout = rules.rule('my.payroll.cp39-text-file', '2026-10-01').value;
  const total = (fields) => fields.reduce((sum, field) => sum + field.length, 0);
  assert.equal(total(layout.header), layout.headerLength);
  assert.equal(total(layout.detail), layout.detailLength);
});

test('a missing tax number, identity or employer number is refused, and so is a month with nothing to remit', () => {
  assert.equal(malaysiaCp39({ month: '2026-13', employerNo: '1', employees: staff }).error, 'BAD_MONTH');
  assert.equal(malaysiaCp39({ month: '2025-12', employerNo: '1', employees: staff }).error, 'RULE_NOT_IN_FORCE');
  assert.equal(malaysiaCp39({ month: '2026-10', employees: staff }).error, 'EMPLOYER_NUMBER_REQUIRED');
  assert.equal(malaysiaCp39({ month: '2026-10', employerNo: '12345678901', employees: staff }).error, 'EMPLOYER_NUMBER_REQUIRED');
  assert.equal(malaysiaCp39({ month: '2026-10', employerNo: '1', employees: [] }).error, 'NO_EMPLOYEES');
  const bad = malaysiaCp39({ month: '2026-10', employerNo: '1', employees: [{ name: 'A', pcb: 10, newIc: '123' }, { name: 'B', taxNumber: '1', pcb: -5 }, { name: 'C', taxNumber: '2', passport: 'P1', pcb: 5 }] });
  assert.equal(bad.error, 'BAD_INPUT');
  assert.deepEqual(bad.problems.map((problem) => problem.field), ['employees[0].taxNumber', 'employees[0].newIc', 'employees[1].pcb', 'employees[1]', 'employees[2].countryCode']);
  assert.equal(malaysiaCp39({ month: '2026-10', employerNo: '1', employees: [staff[2]] }).error, 'NOTHING_TO_REMIT');
  const mixed = malaysiaCp39({ month: '2026-10', employerNo: '1', employees: [staff[0], { name: 'No Tax Yet', pcb: 0 }, { pcb: 0 }] });
  assert.equal(mixed.ok, true, JSON.stringify(mixed));
  assert.deepEqual(mixed.data.leftOut, ['No Tax Yet', 'Employee 3']);
});

test('the tool is on the Malaysia engine, read-only, and answers in words', () => {
  const tool = MANIFEST.tools.find((entry) => entry.name === 'my_cp39_file');
  assert.equal(tool.access, 'read');
  const result = ENGINE.run.my_cp39_file({}, { month: '2026-10', employerNo: '9012345678', employees: staff });
  assert.equal(result.ok, true);
  assert.match(ENGINE.words.my_cp39_file(result), /CP39 file 901234567810_2026\.txt for 2026-10: 2 employees, PCB RM2,400\.50, CP38 RM200\.00\. Upload it in e-PCB Plus and pay by 2026-11-15\./);
});
