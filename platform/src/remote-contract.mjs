export const REMOTE_QUERY_TOOLS = new Set([
  'company_profile',
  'list_invoices',
  'gst_payable',
  'deadlines',
  'exceptions',
  'trial_balance',
  'period_status',
  'validate_gstin',
]);

export const COMPANY_PROFILE_FIELDS = ['name', 'gstin', 'pan', 'state', 'address', 'city', 'pin', 'entityType'];

export function isRemoteQuery(name) {
  return REMOTE_QUERY_TOOLS.has(String(name));
}

export function companyProfilePatch(fields = {}) {
  const patch = {};
  for (const key of COMPANY_PROFILE_FIELDS) {
    if (Object.hasOwn(fields || {}, key) && fields[key] != null) patch[key] = fields[key];
  }
  return patch;
}
