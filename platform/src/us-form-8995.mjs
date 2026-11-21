const ROWS = ['1i', '1ii', '1iii', '1iv', '1v'];
const ofBasis = (amount, basisPoints) => Math.round((amount * basisPoints) / 10000);
const total = (items, pick) => items.reduce((sum, item) => sum + pick(item), 0);
const magnitude = (value) => Math.abs(Math.round(Number(value) || 0));

export function allocateQbiAdjustments(businesses, { byOwner = {}, shared = 0 } = {}) {
  const rows = businesses.map((item) => ({ ...item, adjustment: 0 }));
  const spread = (amount, members) => {
    if (!amount || !members.length) return;
    const base = total(members, (row) => Math.max(0, row.profit));
    let left = amount;
    members.forEach((row, index) => {
      const share = index === members.length - 1 ? left : base > 0 ? Math.round((amount * Math.max(0, row.profit)) / base) : Math.round(amount / members.length);
      row.adjustment += share;
      left -= share;
    });
  };
  const preferProfit = (members) => (members.some((row) => row.profit > 0) ? members.filter((row) => row.profit > 0) : members);
  for (const [owner, amount] of Object.entries(byOwner)) spread(amount, preferProfit(rows.filter((row) => row.owner === owner)));
  spread(shared, preferProfit(rows));
  return rows.map(({ adjustment, ...row }) => ({ ...row, qbi: row.profit - adjustment }));
}

export function computeForm8995({ businesses = [], qbiLossCarryforward = 0, reitPtp = 0, reitPtpLossCarryforward = 0, taxableIncome = 0, netCapitalGain = 0, basisPoints, minimum = null }) {
  const rows = businesses.map((item) => ({ id: item.id, name: item.name, qbi: Math.round(item.qbi), active: item.active === true ? true : item.active === false ? false : null }));
  const line2 = total(rows, (row) => row.qbi);
  const line3 = 0 - magnitude(qbiLossCarryforward);
  const line4 = Math.max(0, line2 + line3);
  const line5 = ofBasis(line4, basisPoints);
  const line6 = Math.round(reitPtp);
  const line7 = 0 - magnitude(reitPtpLossCarryforward);
  const line8 = Math.max(0, line6 + line7);
  const line9 = ofBasis(line8, basisPoints);
  const line10 = line5 + line9;
  const line11 = Math.max(0, Math.round(taxableIncome));
  const line12 = Math.max(0, Math.round(netCapitalGain));
  const line13 = Math.max(0, line11 - line12);
  const line14 = ofBasis(line13, basisPoints);
  const beforeMinimum = Math.min(line10, line14);
  const qbiCarryforward = Math.min(0, line2 + line3);
  const reitPtpCarryforward = Math.min(0, line6 + line7);
  const lines = { 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14 };
  rows.slice(0, ROWS.length).forEach((row, index) => { lines[ROWS[index]] = row.qbi; });
  const activeQbi = total(rows.filter((row) => row.active === true), (row) => row.qbi);
  const unanswered = rows.filter((row) => row.active === null);
  let deduction = beforeMinimum;
  let minimumDeduction = 0;
  let minimumMayApply = false;
  if (minimum) {
    const qualifies = rows.some((row) => row.active === true) && activeQbi >= minimum.activeFloor;
    minimumDeduction = qualifies ? minimum.amount : 0;
    deduction = Math.max(beforeMinimum, minimumDeduction);
    const possibleQbi = activeQbi + total(unanswered, (row) => Math.max(0, row.qbi));
    minimumMayApply = !qualifies && unanswered.length > 0 && possibleQbi >= minimum.activeFloor && beforeMinimum < minimum.amount;
    Object.assign(lines, { 15: beforeMinimum, 16: minimumDeduction, 17: deduction }, qbiCarryforward < 0 ? { 18: qbiCarryforward } : {}, reitPtpCarryforward < 0 ? { 19: reitPtpCarryforward } : {});
  } else {
    Object.assign(lines, { 15: deduction }, qbiCarryforward < 0 ? { 16: qbiCarryforward } : {}, reitPtpCarryforward < 0 ? { 17: reitPtpCarryforward } : {});
  }
  return {
    lines,
    deduction,
    businesses: rows,
    activeQbi,
    minimumDeduction,
    minimumMayApply,
    unanswered: unanswered.map((row) => row.name),
    carryforward: { qbiLoss: 0 - qbiCarryforward, reitPtpLoss: 0 - reitPtpCarryforward },
  };
}
