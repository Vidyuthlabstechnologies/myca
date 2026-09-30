import { parseClients, validateClients } from './clients.mjs';
import { parseDocs, collectionStatus, chasePlan } from './docs.mjs';
import { listDeadlines, deadlineStatus, monthsAround } from './deadlines.mjs';
import { dashboard } from './dashboard.mjs';

export function parseHolidays(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.split(',')[0])
    .map((v) => v.trim())
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
}

export function complianceRun({ clientsText, docsText, holidaysText = '' }, { months, asOfDate }) {
  const clientRes = parseClients(clientsText);
  const docRes = parseDocs(docsText);
  const holidays = parseHolidays(holidaysText);
  const errors = [...clientRes.errors, ...docRes.errors, ...validateClients(clientRes.rows).errors];

  const deadlines = deadlineStatus({
    deadlines: listDeadlines({ clients: clientRes.rows, months: months || monthsAround(asOfDate) }),
    asOfDate,
  });

  const collection = collectionStatus({ docs: docRes.rows });

  const dueInfo = {};
  for (const d of deadlines) {
    const key = `${d.clientId}|${d.returnType}|${d.period}`;
    if (!(key in dueInfo)) {
      dueInfo[key] = { dueDate: d.dueDate, daysUntil: d.daysUntil };
    }
  }

  const chase = chasePlan({
    clients: clientRes.rows,
    scope: deadlines.map((d) => ({ clientId: d.clientId, returnType: d.returnType, period: d.period })),
    docs: docRes.rows,
    dueInfo,
  });

  const board = dashboard({ clients: clientRes.rows, deadlines, collection, docs: docRes.rows });

  return { clients: clientRes.rows, docs: docRes.rows, holidays, errors, deadlines, collection, chase, board, ok: board.ok };
}