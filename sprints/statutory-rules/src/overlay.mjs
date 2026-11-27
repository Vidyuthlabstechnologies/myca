import { nextDay, previousDay } from './dates.mjs';

export function mergeRecords(base, additions) {
  let all = base.map((record) => structuredClone(record));
  const ordered = [...additions].sort((left, right) => (left.effectiveFrom < right.effectiveFrom ? -1 : left.effectiveFrom > right.effectiveFrom ? 1 : 0));
  for (const added of ordered) {
    const next = [];
    for (const version of all) {
      if (version.id !== added.id) {
        next.push(version);
        continue;
      }
      const startsInside = version.effectiveFrom >= added.effectiveFrom && (added.effectiveTo === null || version.effectiveFrom <= added.effectiveTo);
      const endsInside = version.effectiveTo !== null && version.effectiveTo >= added.effectiveFrom && (added.effectiveTo === null || version.effectiveTo <= added.effectiveTo);
      const reachesPast = added.effectiveTo !== null && (version.effectiveTo === null || version.effectiveTo > added.effectiveTo);
      const overlaps = (version.effectiveTo === null || version.effectiveTo >= added.effectiveFrom) && (added.effectiveTo === null || version.effectiveFrom <= added.effectiveTo);
      if (!overlaps) {
        next.push(version);
        continue;
      }
      if (version.effectiveFrom < added.effectiveFrom) {
        const before = structuredClone(version);
        before.effectiveTo = previousDay(added.effectiveFrom);
        next.push(before);
      }
      if (reachesPast && !(startsInside && endsInside)) {
        const after = structuredClone(version);
        after.effectiveFrom = nextDay(added.effectiveTo);
        next.push(after);
      }
    }
    next.push(structuredClone(added));
    all = next;
  }
  return all;
}
