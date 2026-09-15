import { addDays, daysUntil, escalationLevel, fyOf, nextWorkingDay } from './calendar.mjs';

const END = 'END';

function truthy(v) {
  return v === true || ['true', 'yes', '1'].includes(String(v).trim().toLowerCase());
}

function prevMonth(ym) {
  return addDays(`${ym}-01`, -1).slice(0, 7);
}

function padDay(ym, day) {
  return `${ym}-${String(day).padStart(2, '0')}`;
}

const QRMP_QUARTER = { 1: 3, 4: 4, 7: 1, 10: 2 };
const TDS_QUARTER = { 1: 3, 5: 4, 7: 1, 10: 2 };

function quarterPeriodOf(dueMonth, dueYm, map) {
  const q = map[dueMonth];
  return `Q${q} ${fyOf(dueYm)}`;
}

function auditLabel(kind) {
  if (kind === 'tp') return 'ITR (TP)';
  if (kind === 'audit') return 'ITR (audit)';
  return 'ITR (no audit)';
}

export function profileOf(raw) {
  const turnover = Number(raw.turnover);
  const entity = String(raw.entity || '').trim().toLowerCase();
  let audit;
  if (entity === 'company') audit = true;
  else if (entity === 'individual') audit = turnover > 5000000;
  else audit = turnover > 10000000;
  const hasGst = truthy(raw.gst);
  const gstQuarterly = hasGst && truthy(raw.qrmp);
  return {
    clientId: String(raw.clientId).trim(),
    name: String(raw.name || '').trim(),
    tier: String(raw.tier || '').trim(),
    entity,
    turnover,
    hasGst,
    gstMonthly: hasGst && !gstQuarterly,
    gstQuarterly,
    tdsDeductor: truthy(raw.tdsDeductor),
    pf: truthy(raw.pf),
    advanceTax: truthy(raw.advanceTax),
    audit,
    tp: truthy(raw.tp),
  };
}

export function returnsFor(profile) {
  const list = [];
  if (profile.gstMonthly) list.push({ code: 'GSTR-1', label: 'GSTR-1 (monthly)' }, { code: 'GSTR-3B', label: 'GSTR-3B (monthly)' });
  if (profile.gstQuarterly) list.push({ code: 'GSTR-1', label: 'GSTR-1 QRMP' }, { code: 'GSTR-3B', label: 'GSTR-3B QRMP' });
  if (profile.tdsDeductor) {
    list.push({ code: 'GSTR-7', label: 'GSTR-7' });
    for (let q = 1; q <= 4; q++) list.push({ code: 'TDS_QUARTERLY', label: `TDS Quarterly (Q${q})` });
  }
  if (profile.pf) list.push({ code: 'PF', label: 'PF' });
  if (profile.advanceTax) list.push({ code: 'ADVANCE_TAX', label: 'Advance Tax' });
  const itrKind = profile.tp ? 'tp' : profile.audit ? 'audit' : 'noaudit';
  list.push({ code: 'ITR', label: auditLabel(itrKind) });
  if (profile.gstMonthly) list.push({ code: 'GSTR-9', label: 'GSTR-9' });
  return list;
}

export function listDeadlines({ clients, months, holidays = [] }) {
  const rows = (Array.isArray(clients) ? clients : []).map(profileOf);
  const windows = [...(Array.isArray(months) ? months : [])].sort();
  const out = [];

  for (const profile of rows) {
    for (const ym of windows) {
      const m = Number(ym.slice(5, 7));
      const monthY = ym.slice(0, 4);
      const prevYm = prevMonth(ym);

      if (profile.gstMonthly) {
        out.push({ clientId: profile.clientId, returnType: 'GSTR-1', returnLabel: 'GSTR-1 (monthly)', period: prevYm, dueDate: nextWorkingDay(padDay(ym, 11), holidays) });
        out.push({ clientId: profile.clientId, returnType: 'GSTR-3B', returnLabel: 'GSTR-3B (monthly)', period: prevYm, dueDate: nextWorkingDay(padDay(ym, 20), holidays) });
      }
      if (profile.gstQuarterly && [1, 4, 7, 10].includes(m)) {
        const period = `Q${QRMP_QUARTER[m]} ${fyOf(ym)}`;
        out.push({ clientId: profile.clientId, returnType: 'GSTR-1', returnLabel: 'GSTR-1 QRMP', period, dueDate: nextWorkingDay(padDay(ym, 13), holidays) });
        out.push({ clientId: profile.clientId, returnType: 'GSTR-3B', returnLabel: 'GSTR-3B QRMP', period, dueDate: nextWorkingDay(padDay(ym, 22), holidays) });
      }

      if (profile.tdsDeductor) {
        out.push({ clientId: profile.clientId, returnType: 'GSTR-7', returnLabel: 'GSTR-7', period: prevYm, dueDate: nextWorkingDay(padDay(ym, 10), holidays) });
        if (TDS_QUARTER[m]) {
          out.push({ clientId: profile.clientId, returnType: 'TDS_QUARTERLY', returnLabel: `TDS Quarterly (Q${TDS_QUARTER[m]})`, period: `Q${TDS_QUARTER[m]} ${fyOf(ym)}`, dueDate: nextWorkingDay(padDay(ym, 31), holidays) });
        }
      }
      if (profile.pf) {
        out.push({ clientId: profile.clientId, returnType: 'PF', returnLabel: 'PF', period: prevYm, dueDate: nextWorkingDay(padDay(ym, 15), holidays) });
      }
      if (profile.advanceTax && [3, 6, 9, 12].includes(m)) {
        out.push({ clientId: profile.clientId, returnType: 'ADVANCE_TAX', returnLabel: 'Advance Tax', period: `FY ${fyOf(ym)}`, dueDate: nextWorkingDay(padDay(ym, 15), holidays) });
      }

      const itrKind = profile.tp ? 'tp' : profile.audit ? 'audit' : 'noaudit';
      const itrDueDay = itrKind === 'tp' ? 30 : itrKind === 'audit' ? 31 : 31;
      const itrDueMonth = itrKind === 'tp' ? 11 : itrKind === 'audit' ? 10 : 7;
      if (m === itrDueMonth) {
        const period = `FY ${fyOf(`${monthY}-01`)}`;
        out.push({ clientId: profile.clientId, returnType: 'ITR', returnLabel: auditLabel(itrKind), period, dueDate: nextWorkingDay(padDay(ym, itrDueDay), holidays) });
      }

      if (profile.gstMonthly && m === 12) {
        out.push({ clientId: profile.clientId, returnType: 'GSTR-9', returnLabel: 'GSTR-9', period: `FY ${fyOf(`${monthY}-01`)}`, dueDate: nextWorkingDay(padDay(ym, 31), holidays) });
      }
    }
  }

  return out.sort((a, b) => (a.dueDate === b.dueDate ? (a.clientId === b.clientId ? a.returnType.localeCompare(b.returnType) : a.clientId.localeCompare(b.clientId)) : a.dueDate.localeCompare(b.dueDate)));
}

export function deadlineStatus({ deadlines, asOfDate }) {
  return deadlines.map((d) => {
    const dU = daysUntil(d.dueDate, asOfDate);
    return { ...d, daysUntil: dU, level: escalationLevel(dU) };
  });
}