export function fixtureRecord(overrides = {}) {
  return {
    id: 'test.threshold',
    value: 100000,
    effectiveFrom: '2024-04-01',
    effectiveTo: null,
    act: 'TEST',
    section: '',
    source: 'Test fixture, not law',
    attestations: [],
    ...overrides
  };
}

export function versionedFixture() {
  return [
    fixtureRecord({ id: 'test.rate', value: 5, effectiveFrom: '2025-10-01', effectiveTo: null, basis: 'taxable_value' }),
    fixtureRecord({ id: 'test.rate', value: 12, effectiveFrom: '2017-07-01', effectiveTo: '2025-09-30', basis: 'taxable_value' }),
    fixtureRecord({ id: 'test.limit', value: { amountPaise: 25000000 }, effectiveFrom: '2025-04-01', effectiveTo: '2026-03-31' }),
    fixtureRecord({ id: 'test.single-day', value: true, effectiveFrom: '2026-01-15', effectiveTo: '2026-01-15' })
  ];
}
