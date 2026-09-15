import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escalate, dashboard } from '../src/dashboard.mjs';

function mkDeadline(clientId, returnType, period, dueDate) {
  return { clientId, returnType, returnLabel: returnType, period, dueDate };
}

function mkClients() {
  return [
    { clientId: 'CL-001', name: 'Sunrise Industries', tier: 'PREMIUM' },
    { clientId: 'CL-002', name: 'Dr. Sharma Clinic', tier: 'STANDARD' },
    { clientId: 'CL-003', name: 'Greenfields Pvt Ltd', tier: 'BUSINESS' },
    { clientId: 'CL-004', name: 'Quick Mart Traders', tier: 'STANDARD' }
  ];
}

function mkDocs() {
  return [
    { clientId: 'CL-003', period: '2026-08', returnType: 'GSTR-3B', docType: 'gstr2b', status: 'received' },
    { clientId: 'CL-003', period: '2026-08', returnType: 'GSTR-3B', docType: 'purchase_register', status: 'received' },
    { clientId: 'CL-003', period: '2026-08', returnType: 'GSTR-3B', docType: 'sales_register', status: 'pending' },
    { clientId: 'CL-001', period: '2026-08', returnType: 'GSTR-3B', docType: 'gstr2b', status: 'received' },
    { clientId: 'CL-001', period: '2026-08', returnType: 'GSTR-3B', docType: 'purchase_register', status: 'pending' },
    { clientId: 'CL-001', period: '2026-08', returnType: 'GSTR-3B', docType: 'sales_register', status: 'pending' },
    { clientId: 'CL-004', period: 'Q2 2026-27', returnType: 'GSTR-3B', docType: 'gstr2b', status: 'received' },
    { clientId: 'CL-004', period: 'Q2 2026-27', returnType: 'GSTR-3B', docType: 'purchase_register', status: 'received' },
    { clientId: 'CL-004', period: 'Q2 2026-27', returnType: 'GSTR-3B', docType: 'sales_register', status: 'received' }
  ];
}

function mkCollection() {
  return new Map([
    ['CL-001|GSTR-3B|2026-08', { clientId: 'CL-001', returnType: 'GSTR-3B', period: '2026-08', completeness: 1 / 3, missing: ['purchase_register', 'sales_register'] }],
    ['CL-003|GSTR-3B|2026-08', { clientId: 'CL-003', returnType: 'GSTR-3B', period: '2026-08', completeness: 2 / 3, missing: ['sales_register'] }],
    ['CL-004|GSTR-3B|Q2 2026-27', { clientId: 'CL-004', returnType: 'GSTR-3B', period: 'Q2 2026-27', completeness: 1, missing: [] }]
  ]);
}

function fixtureDeadlines() {
  return [
    mkDeadline('CL-001', 'GSTR-7', '2026-08', '2026-09-10'),
    mkDeadline('CL-001', 'GSTR-1', '2026-08', '2026-09-11'),
    mkDeadline('CL-001', 'GSTR-3B', '2026-08', '2026-09-21'),
    mkDeadline('CL-001', 'TDS_QUARTERLY', 'Q1 2026-27', '2026-07-31'),
    mkDeadline('CL-001', 'ITR', 'FY 2025-26', '2026-07-31'),
    mkDeadline('CL-002', 'ITR', 'FY 2025-26', '2026-07-31'),
    mkDeadline('CL-003', 'GSTR-7', '2026-08', '2026-09-10'),
    mkDeadline('CL-003', 'GSTR-1', '2026-08', '2026-09-11'),
    mkDeadline('CL-003', 'GSTR-3B', '2026-08', '2026-09-21'),
    mkDeadline('CL-003', 'PF', '2026-08', '2026-09-15'),
    mkDeadline('CL-003', 'ADVANCE_TAX', 'FY 2026-27', '2026-09-15'),
    mkDeadline('CL-003', 'TDS_QUARTERLY', 'Q1 2026-27', '2026-07-31'),
    mkDeadline('CL-004', 'GSTR-1 QR', 'Q2 2026-27', '2026-10-13'),
    mkDeadline('CL-004', 'GSTR-3B QR', 'Q2 2026-27', '2026-10-22'),
    mkDeadline('CL-004', 'ITR', 'FY 2025-26', '2026-11-02')
  ];
}

const AS_OF = '2026-09-07';

describe('Agent C: Compliance Dashboard', () => {
  it('GATE 1: escalate returns correct daysUntil and level for Sep deadlines', () => {
    const deadlines = fixtureDeadlines();
    const enriched = escalate(deadlines, AS_OF);
    const m = Object.fromEntries(enriched.map(d => [`${d.clientId}|${d.returnType}|${d.period}`, d]));

    assert.equal(m['CL-001|GSTR-7|2026-08'].daysUntil, 3);
    assert.equal(m['CL-001|GSTR-7|2026-08'].level, 'due_soon');
    assert.equal(m['CL-001|GSTR-1|2026-08'].daysUntil, 4);
    assert.equal(m['CL-001|GSTR-1|2026-08'].level, 'due_soon');
    assert.equal(m['CL-001|GSTR-3B|2026-08'].daysUntil, 14);
    assert.equal(m['CL-001|GSTR-3B|2026-08'].level, 'on_track');
    assert.equal(m['CL-003|GSTR-7|2026-08'].daysUntil, 3);
    assert.equal(m['CL-003|GSTR-7|2026-08'].level, 'due_soon');
    assert.equal(m['CL-003|GSTR-1|2026-08'].daysUntil, 4);
    assert.equal(m['CL-003|GSTR-1|2026-08'].level, 'due_soon');
    assert.equal(m['CL-003|GSTR-3B|2026-08'].daysUntil, 14);
    assert.equal(m['CL-003|GSTR-3B|2026-08'].level, 'on_track');
    assert.equal(m['CL-003|PF|2026-08'].daysUntil, 8);
    assert.equal(m['CL-003|PF|2026-08'].level, 'on_track');
    assert.equal(m['CL-003|ADVANCE_TAX|FY 2026-27'].daysUntil, 8);
    assert.equal(m['CL-003|ADVANCE_TAX|FY 2026-27'].level, 'on_track');
    assert.equal(m['CL-001|ITR|FY 2025-26'].daysUntil, -38);
    assert.equal(m['CL-001|ITR|FY 2025-26'].level, 'overdue');
    assert.equal(m['CL-001|TDS_QUARTERLY|Q1 2026-27'].daysUntil, -38);
    assert.equal(m['CL-001|TDS_QUARTERLY|Q1 2026-27'].level, 'overdue');
    assert.equal(m['CL-002|ITR|FY 2025-26'].daysUntil, -38);
    assert.equal(m['CL-002|ITR|FY 2025-26'].level, 'overdue');
    assert.equal(m['CL-003|TDS_QUARTERLY|Q1 2026-27'].daysUntil, -38);
    assert.equal(m['CL-003|TDS_QUARTERLY|Q1 2026-27'].level, 'overdue');
  });

  it('GATE 2: dashboard perClient completeness exact', () => {
    const enriched = escalate(fixtureDeadlines(), AS_OF);
    const result = dashboard({ clients: mkClients(), deadlines: enriched, collection: mkCollection(), docs: mkDocs() });
    const byId = Object.fromEntries(result.perClient.map(c => [c.clientId, c]));

    assert.equal(byId['CL-001'].completeness, 0.3333);
    assert.equal(byId['CL-002'].completeness, null);
    assert.equal(byId['CL-003'].completeness, 0.6667);
    assert.equal(byId['CL-004'].completeness, 1);
  });

  it('GATE 3: dashboard totals.overdue=4, totals.urgent=0, totals.ok=false', () => {
    const enriched = escalate(fixtureDeadlines(), AS_OF);
    const result = dashboard({ clients: mkClients(), deadlines: enriched, collection: mkCollection(), docs: mkDocs() });

    assert.equal(result.totals.overdue, 4);
    assert.equal(result.totals.urgent, 0);
    assert.equal(result.ok, false);
  });

  it('GATE 4: dashboard perClient status correct', () => {
    const enriched = escalate(fixtureDeadlines(), AS_OF);
    const result = dashboard({ clients: mkClients(), deadlines: enriched, collection: mkCollection(), docs: mkDocs() });
    const byId = Object.fromEntries(result.perClient.map(c => [c.clientId, c]));

    assert.equal(byId['CL-001'].status, 'overdue');
    assert.equal(byId['CL-002'].status, 'overdue');
    assert.equal(byId['CL-003'].status, 'overdue');
    assert.equal(byId['CL-004'].status, 'on_track');
  });

  it('GATE 5: nextDeadline for CL-001=GSTR-7 2026-09-10, CL-002=null', () => {
    const enriched = escalate(fixtureDeadlines(), AS_OF);
    const result = dashboard({ clients: mkClients(), deadlines: enriched, collection: mkCollection(), docs: mkDocs() });
    const byId = Object.fromEntries(result.perClient.map(c => [c.clientId, c]));

    assert.equal(byId['CL-001'].nextDeadline.returnType, 'GSTR-7');
    assert.equal(byId['CL-001'].nextDeadline.dueDate, '2026-09-10');
    assert.equal(byId['CL-002'].nextDeadline, null);
  });

  it('GATE 6: alerts contain at least one severity error mentioning ITR', () => {
    const enriched = escalate(fixtureDeadlines(), AS_OF);
    const result = dashboard({ clients: mkClients(), deadlines: enriched, collection: mkCollection(), docs: mkDocs() });

    const itrErrors = result.alerts.filter(a => a.severity === 'error' && a.message.includes('ITR'));
    assert.ok(itrErrors.length >= 1, 'Expected at least one error alert mentioning ITR');
  });

  it('GATE 7: totals.chaseMessages=3', () => {
    const enriched = escalate(fixtureDeadlines(), AS_OF);
    const result = dashboard({ clients: mkClients(), deadlines: enriched, collection: mkCollection(), docs: mkDocs() });

    assert.equal(result.totals.chaseMessages, 3);
  });

  it('GATE 8: empty deadlines and collection yields ok=true', () => {
    const result = dashboard({ clients: mkClients(), deadlines: [], collection: new Map(), docs: [] });

    assert.equal(result.ok, true);
    assert.equal(result.totals.overdue, 0);
    assert.equal(result.totals.urgent, 0);
    assert.equal(result.perClient.length, 4);
    for (const c of result.perClient) {
      assert.equal(c.status, 'on_track');
      assert.equal(c.nextDeadline, null);
      assert.equal(c.completeness, null);
      assert.equal(c.chaseCount, 0);
    }
  });
});
