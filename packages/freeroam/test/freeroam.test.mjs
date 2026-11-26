import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  jwsSign, jkt, kid, seal,
} from '@pascaal/hallmark';
import {
  freeroam, evaluateFreeroam, createKeyResolver,
  extractPassport, PASSPORT_TYP,
} from '../src/index.js';

const AUDIENCE = 'https://gw.test.example/';
const TENANT = 'tnt_test';
const NOW = 1772323200;

function ed25519() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateJwk: pair.privateKey.export({ format: 'jwk' }),
    publicJwk: pair.publicKey.export({ format: 'jwk' }),
  };
}

function makePassport(agent, overrides = {}) {
  const idp = ed25519();
  const attestation = {
    iss: 'https://idp.test.example/',
    sub: 'usr_private_should_not_log',
    aud: AUDIENCE,
    iat: NOW,
    nbf: NOW,
    exp: NOW + 120,
    jti: 'at_test_0001',
    amr: ['hwk', 'user_presence'],
    cnf: { jkt: jkt(agent.publicJwk) },
    hlm: {
      v: 1,
      tid: TENANT,
      agent: { spid: 'spid://test/orchestrator', name: 'Test Orchestrator', caps: ['commerce.checkout.v1'] },
      pol: { id: 'pol_test', v: 1 },
      budget: { req: 5, tin: 4096, tout: 1024, cost: 1_000_000, conc: 1, depth: 0, wid: 0 },
    },
  };
  const { jws: attJws } = jwsSign('EdDSA', idp.privateJwk, {
    typ: 'hallmark+root-attestation',
    kid: kid(idp.publicJwk),
  }, attestation);
  const rootSeal = seal(attJws);

  const claims = {
    iss: 'urn:hallmark:idp:tnt_test',
    sub: 'ses_checkout_0001',
    jti: 'grant_checkout_0001',
    aud: AUDIENCE,
    azp: 'usr_private_should_not_log',
    amr: ['agent_delegation'],
    iat: NOW,
    nbf: NOW,
    exp: NOW + 60,
    sqn: 1,
    hlm: {
      v: 1,
      tid: TENANT,
      spid: 'spid://test/checkout-agent',
      name: 'Checkout Agent',
      prof: 'checkout.default.v1',
      caps: ['commerce.checkout.v1'],
      depth: 1,
      ln: [{ sid: 'at_test_0001', h: rootSeal }],
      root: {
        at: 'at_test_0001',
        h: rootSeal,
        iss: 'https://idp.test.example/',
        sub: 'usr_private_should_not_log',
      },
      budget: { req: 5, tin: 4096, tout: 1024, cost: 1_000_000, conc: 1, depth: 0, wid: 0 },
      pol: { id: 'pol_test', v: 1 },
      ...(overrides.hlm || {}),
    },
    ...overrides.claims,
  };

  const { jws } = jwsSign('EdDSA', agent.privateJwk, {
    typ: PASSPORT_TYP,
    kid: kid(agent.publicJwk),
  }, claims);
  return { jws, claims, attJws };
}

function reqWith(jws, method = 'GET', path = '/api/status') {
  return {
    method,
    url: path,
    headers: jws ? { authorization: `Hallmark ${jws}` } : {},
  };
}

function optionsFor(agent) {
  return {
    resolveKey: createKeyResolver([agent.publicJwk]),
    audience: AUDIENCE,
    tenant: TENANT,
    now: NOW,
    nowMs: NOW * 1000,
  };
}

test('extractPassport reads Authorization and X-Hallmark-Passport', () => {
  const bearer = extractPassport({ authorization: 'Bearer something' });
  assert.equal(bearer.present, false);
  assert.equal(bearer.ignored, true);

  const direct = extractPassport({ 'x-hallmark-passport': 'a.b.c' });
  assert.deepEqual({ present: direct.present, jws: direct.jws, source: direct.source },
    { present: true, jws: 'a.b.c', source: 'header' });

  assert.throws(
    () => extractPassport({ authorization: 'Hallmark a.b.c', 'x-hallmark-jws': 'a.b.c' }),
    /multiple Hallmark credential headers/,
  );
});

test('Freeroam observes a valid passport and never denies', () => {
  const agent = ed25519();
  const { jws } = makePassport(agent);
  const events = [];
  let nextCalled = false;

  const middleware = freeroam({ ...optionsFor(agent), onEvent: (e) => events.push(e) });
  const req = reqWith(jws);
  const result = middleware(req, {}, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(result.ok, true);
  assert.equal(req.hallmark.mode, 'observe');
  assert.equal(req.hallmark.session, 'ses_checkout_0001');
  assert.equal(req.hallmark.key, jkt(agent.publicJwk));
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'passport.observed');
  assert.equal(events[0].method, 'GET');
  assert.equal(events[0].path, '/api/status');

  const serialized = JSON.stringify(events[0]);
  assert.ok(!serialized.includes('usr_private_should_not_log'));
  assert.ok(!serialized.includes('azp'));
  assert.ok(!serialized.includes('"ln"'));
  assert.ok(!serialized.includes('"cnf"'));
});

test('Freeroam records a bad signature as a rejection but still passthroughs', () => {
  const agent = ed25519();
  const { jws } = makePassport(agent);
  const parts = jws.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);

  const result = evaluateFreeroam(reqWith(parts.join('.')), optionsFor(agent));
  assert.equal(result.decision, 'passthrough');
  assert.equal(result.context.ok, false);
  assert.equal(result.event.event, 'passport.rejected');
  assert.equal(result.event.code, 'HLM_1003');
  assert.equal(result.event.reason, 'bad_signature');
});

test('Freeroam emits passport.absent for unauthenticated traffic', () => {
  const agent = ed25519();
  const result = evaluateFreeroam(reqWith(null), optionsFor(agent));
  assert.equal(result.decision, 'passthrough');
  assert.equal(result.context.present, false);
  assert.equal(result.event.event, 'passport.absent');
});

test('Freeroam refuses private key material in the verifier', () => {
  const agent = ed25519();
  assert.throws(
    () => createKeyResolver([agent.privateJwk]),
    /private key material must not be installed/,
  );
});
