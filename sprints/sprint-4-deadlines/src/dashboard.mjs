import { daysUntil, escalationLevel } from './calendar.mjs';

function r4(n) { return Math.round(n * 10000) / 10000; }

export function escalate(deadlines, asOfDate) {
  return deadlines.map(d => ({
    ...d,
    daysUntil: daysUntil(d.dueDate, asOfDate),
    level: escalationLevel(daysUntil(d.dueDate, asOfDate))
  }));
}

export function dashboard({ clients, deadlines, collection, docs }) {
  const byClient = new Map();
  for (const d of deadlines) {
    if (!byClient.has(d.clientId)) byClient.set(d.clientId, []);
    byClient.get(d.clientId).push(d);
  }

  const clientMap = new Map(clients.map(c => [c.clientId, c]));
  const perClient = [];

  for (const cid of [...clientMap.keys()].sort()) {
    const ds = byClient.get(cid) || [];
    const c = clientMap.get(cid);
    const levels = ds.map(d => d.level);
    const status = levels.includes('overdue') ? 'overdue'
      : levels.includes('urgent') ? 'urgent'
      : levels.includes('due_soon') ? 'due_soon'
      : 'on_track';

    const future = ds.filter(d => d.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    const next = future.length > 0 ? future[0] : null;

    const overdue = ds.filter(d => d.level === 'overdue');
    const urgent = ds.filter(d => d.level === 'urgent');
    const dueSoon = ds.filter(d => d.level === 'due_soon');
    const onTrack = ds.filter(d => d.level === 'on_track');

    const entries = [...collection.entries()].filter(
      ([k]) => k.startsWith(cid + '|')
    );
    const vals = entries.map(([, v]) => v.completeness);
    const completeness = vals.length > 0 ? r4(vals.reduce((s, v) => s + v, 0) / vals.length) : null;

    const chaseCount = docs.filter(row => row.clientId === cid && row.status === 'pending').length;

    perClient.push({
      clientId: cid,
      name: c.name,
      tier: c.tier,
      status,
      nextDeadline: next ? { returnType: next.returnType, period: next.period, dueDate: next.dueDate, daysUntil: next.daysUntil } : null,
      overdue, urgent, dueSoon, onTrack,
      completeness,
      chaseCount
    });
  }

  const totalDeadlines = deadlines.length;
  const overdueCount = deadlines.filter(d => d.level === 'overdue').length;
  const urgentCount = deadlines.filter(d => d.level === 'urgent').length;
  const dueSoonCount = deadlines.filter(d => d.level === 'due_soon').length;
  const onTrackCount = deadlines.filter(d => d.level === 'on_track').length;
  const compVals = perClient.map(p => p.completeness).filter(v => v !== null);
  const completenessAvg = compVals.length > 0 ? r4(compVals.reduce((s, v) => s + v, 0) / compVals.length) : 0;
  const chaseMessages = docs.filter(row => row.status === 'pending').length;

  const alerts = [];
  for (const d of deadlines) {
    if (d.level === 'overdue') {
      alerts.push({ severity: 'error', message: `${d.returnType} ${d.period} for ${d.clientId} is overdue (due ${d.dueDate})` });
    } else if (d.level === 'urgent') {
      alerts.push({ severity: 'warning', message: `${d.returnType} ${d.period} for ${d.clientId} is urgent (due ${d.dueDate})` });
    } else if (d.level === 'due_soon') {
      alerts.push({ severity: 'warning', message: `${d.returnType} ${d.period} for ${d.clientId} due soon (due ${d.dueDate})` });
    } else {
      alerts.push({ severity: 'info', message: `${d.returnType} ${d.period} for ${d.clientId} on track (due ${d.dueDate})` });
    }
  }

  return {
    perClient,
    totals: { clients: clients.length, deadlines: totalDeadlines, overdue: overdueCount, urgent: urgentCount, dueSoon: dueSoonCount, onTrack: onTrackCount, completenessAvg, chaseMessages },
    alerts,
    ok: overdueCount === 0 && urgentCount === 0
  };
}
