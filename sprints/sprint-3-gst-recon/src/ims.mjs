export const SECTION_LABELS = {
  'B2B': 'Business-to-business (table 4A)',
  'B2B-URD': 'B2B supplies by unregistered suppliers',
  'CDNR': 'Credit and debit notes',
  'B2BA': 'Amended B2B documents',
  'ISD': 'Input service distributor',
  'IMPS': 'Import of services',
  'REV': 'Reverse charge',
  'HSN': 'HSN summary',
};

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function sectionLabel(section) {
  return SECTION_LABELS[section] ?? String(section);
}

export function imsSnapshot(gstr2bRows) {
  const sections = {};
  const total = { count: 0, taxable: 0, inputCredit: 0 };

  for (const row of gstr2bRows) {
    const section = row.section;
    if (!sections[section]) sections[section] = { count: 0, taxable: 0, inputCredit: 0 };
    const inputCredit = round2((row.cgst || 0) + (row.sgst || 0) + (row.igst || 0));
    sections[section].count += 1;
    sections[section].taxable = round2(sections[section].taxable + (row.taxableValue || 0));
    sections[section].inputCredit = round2(sections[section].inputCredit + inputCredit);
    total.count += 1;
    total.taxable = round2(total.taxable + (row.taxableValue || 0));
    total.inputCredit = round2(total.inputCredit + inputCredit);
  }

  return { sections, total };
}