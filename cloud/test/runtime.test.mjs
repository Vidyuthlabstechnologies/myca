import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProduction, hostingName, serviceRevision, databaseSsl, databaseTlsProblem, proxyHopsProblem } from '../src/runtime.mjs';
import { trustedProxyHops } from '../src/api.mjs';

test('production is Cloud Run or an explicit MYCA_PRODUCTION switch, on any host', () => {
  assert.equal(isProduction({}), false);
  assert.equal(isProduction({ K_SERVICE: 'myca-api' }), true);
  for (const on of ['1', 'true', 'TRUE', 'yes', ' on ']) assert.equal(isProduction({ MYCA_PRODUCTION: on }), true, on);
  for (const off of ['', '0', 'false', 'no', 'off']) assert.equal(isProduction({ MYCA_PRODUCTION: off }), false, off);
  assert.equal(hostingName({ K_SERVICE: 'x' }), 'Cloud Run');
  assert.equal(hostingName({ MYCA_PRODUCTION: '1' }), 'production');
  assert.equal(hostingName({}), 'development');
});

test('the revision comes from Cloud Run, then MYCA_REVISION, then dev', () => {
  assert.equal(serviceRevision({ K_REVISION: 'myca-api-00012' }), 'myca-api-00012');
  assert.equal(serviceRevision({ MYCA_REVISION: 'abc1234' }), 'abc1234');
  assert.equal(serviceRevision({}), 'dev');
});

test('a proxy hop is trusted only on Cloud Run or when stated, and production elsewhere must state it', () => {
  assert.equal(trustedProxyHops({}), 0);
  assert.equal(trustedProxyHops({ MYCA_PRODUCTION: '1' }), 0, 'the production switch alone trusts no forwarded address');
  assert.equal(trustedProxyHops({ K_SERVICE: 'x' }), 1);
  assert.equal(trustedProxyHops({ MYCA_PRODUCTION: '1', MYCA_TRUSTED_PROXY_HOPS: '1' }), 1);
  assert.equal(trustedProxyHops({ MYCA_PRODUCTION: '1', MYCA_TRUSTED_PROXY_HOPS: '2' }), 2);
  assert.match(proxyHopsProblem({ MYCA_PRODUCTION: '1' }), /MYCA_TRUSTED_PROXY_HOPS/);
  assert.match(proxyHopsProblem({ MYCA_PRODUCTION: '1', MYCA_TRUSTED_PROXY_HOPS: 'one' }), /MYCA_TRUSTED_PROXY_HOPS/);
  assert.equal(proxyHopsProblem({ MYCA_PRODUCTION: '1', MYCA_TRUSTED_PROXY_HOPS: '0' }), '');
  assert.equal(proxyHopsProblem({ MYCA_PRODUCTION: '1', MYCA_TRUSTED_PROXY_HOPS: '1' }), '');
  assert.equal(proxyHopsProblem({ K_SERVICE: 'x' }), '');
  assert.equal(proxyHopsProblem({}), '');
});

test('in production a remote database must use TLS that verifies the server; local sockets and development are exempt', () => {
  const remote = 'postgres://myca:pw@myca.abc123.ap-south-1.rds.amazonaws.com:5432/myca';
  const prod = { MYCA_PRODUCTION: '1' };
  assert.match(databaseTlsProblem(prod, remote), /MYCA_DATABASE_CA/);
  assert.match(databaseTlsProblem(prod, `${remote}?sslmode=require`), /MYCA_DATABASE_CA/, 'require alone does not verify the server');
  assert.equal(databaseTlsProblem({ ...prod, MYCA_DATABASE_CA: '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----' }, remote), '');
  assert.equal(databaseTlsProblem(prod, `${remote}?sslmode=verify-full`), '');
  assert.equal(databaseTlsProblem(prod, 'postgres://myca:pw@localhost/myca?host=/cloudsql/p:r:i'), '');
  assert.equal(databaseTlsProblem(prod, 'postgres://myca:pw@127.0.0.1:54330/myca'), '');
  assert.equal(databaseTlsProblem({}, remote), '');
  assert.equal(databaseSsl({}), undefined);
  assert.deepEqual(databaseSsl({ MYCA_DATABASE_CA: ' PEM ' }), { ca: 'PEM', rejectUnauthorized: true });
});
