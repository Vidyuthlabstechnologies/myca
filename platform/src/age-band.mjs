const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FY_LABEL = /^\d{4}-\d{2}$/;

export function ageAtFyEnd(dateOfBirth, fy) {
  const text = String(dateOfBirth || '');
  if (!ISO_DATE.test(text) || !FY_LABEL.test(String(fy || ''))) return null;
  const [by, bm, bd] = text.split('-').map(Number);
  const check = new Date(Date.UTC(by, bm - 1, bd));
  if (check.getUTCMonth() !== bm - 1 || check.getUTCDate() !== bd) return null;
  const endYear = Number(fy.slice(0, 4)) + 1;
  const age = endYear - by - (bm > 3 ? 1 : 0);
  return age < 0 ? null : age;
}

export function bandOfAge(age) {
  return age >= 80 ? '80-plus' : age >= 60 ? '60-to-79' : 'below-60';
}
