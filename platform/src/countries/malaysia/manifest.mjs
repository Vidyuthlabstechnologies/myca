const MYINVOIS_HOSTS = Object.freeze({ live: Object.freeze(['api.myinvois.hasil.gov.my']), test: Object.freeze(['preprod-api.myinvois.hasil.gov.my']) });

export const MANIFEST = Object.freeze({
  country: 'MY',
  capabilities: Object.freeze({}),
  ruleFamilies: Object.freeze([]),
  tools: Object.freeze([]),
  externalActions: Object.freeze([
    Object.freeze({ id: 'myinvois_cancel', access: 'write', irreversible: true, hosts: MYINVOIS_HOSTS }),
    Object.freeze({ id: 'myinvois_login', access: 'write', hosts: MYINVOIS_HOSTS }),
    Object.freeze({ id: 'myinvois_status', access: 'read', hosts: MYINVOIS_HOSTS }),
    Object.freeze({ id: 'myinvois_submit', access: 'write', irreversible: true, hosts: MYINVOIS_HOSTS }),
    Object.freeze({ id: 'myinvois_tin_validate', access: 'read', hosts: MYINVOIS_HOSTS }),
  ]),
});
