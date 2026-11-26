import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  jwsSign, jkt, kid, seal,
} from '@pascaal/hallmark';
import {
  barricade, evaluateBarricade, signPolicy, loadPolicy,
  createKeyResolver, BudgetLedger, ReplayCache, RevocationSet,
} from '../src/index.js';

const AUDIENCE = 'https://gw.test.example/';
const TENANT = 'tnt_test';
const NOW = 1772323200;
const CHECKOUT_CAP = 'commerce.checkout.v1';
let grantCounter = 0;

function ed25519() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateJwk: pair.privateKey.export({ format: 'jwk' }),
    publicJwk: pair.publicKey.export({ format: 'jwk' }),
  };
}

function makePolicy(provider) {
  return {
    v: 1,
    id: 'barricade_test_v1',
    tenant: TENANT,
    audience: AUDIENCE,
    capabilities: {
      [CHECKOUT_CAP]: {
        methods: ['POST'],
        pathPrefixes: ['/api/checkout'],
        profiles: ['checkout.default.v1'],
        limits: { req: 5, cost: 1_000_000 },
      },
    },
    surfaces: [
      {
        id: 'checkout',
        gate: 'grant',
        tier: 1,
        capability: CHECKOUT_CAP,
        methods: ['POST'],
        pathPrefixes: ['/api/checkout'],
        revocation: 'strict',
        maxStalenessSec: 30,
      },
    ],
  };
}

function makeRevocation(overrides = {}) {
  return new RevocationSet({
    v: 1,
    iat: NOW,
    exp: NOW + 120,
    keys: [],
    sessions: [],
    attestations: [],
    tenants: [],
    ...overrides,
  });
}

function makePassport(agent, overrides = {}) {
  const idp = ed25519();
  grantCounter += 1;
  const grantId = `grant_checkout_${grantCounter}`;
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
      agent: { spid: 'spid://test/orchestrator', name: 'Test Orchestrator', caps: [CHECKOUT_CAP] },
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
    sub: `ses_checkout_${grantCounter}`,
    jti: grantId,
    aud: AUDIENCE,
    azp: 'usr_private_should_not_log',
    amr: ['agent_delegation'],
    iat: NOW,
    nbf: NOW,
    exp: NOW + 60,
    sqn: grantCounter,
    hlm: {
      v: 1,
      tid: TENANT,
      spid: 'spid://test/checkout-agent',
      name: 'Checkout Agent',
      prof: 'checkout.default.v1',
      caps: [CHECKOUT_CAP],
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
    typ: 'hallmark+agent-passport',
    kid: kid(agent.publicJwk),
  }, claims);
  return { jws, claims, grantId };
}

function reqWith(jws, method = 'POST', path = '/api/checkout') {
  return {
    method,
    url: path,
    headers: jws ? { authorization: `Hallmark ${jws}` } : {},
  };
}

function fakeRes() {
  const handlers = new Map();
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = typeof body === 'string' ? JSON.parse(body) : body; },
    once(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    finish() { for (const fn of handlers.get('finish') || []) fn(); },
  };
}

function setup() {
  const provider = ed25519();
  const agent = ed25519();
  const policy = loadPolicy(signPolicy(provider.privateJwk, makePolicy(provider)),
    createKeyResolver([provider.publicJwk]));
  return {
    provider,
    agent,
    policy,
    options: {
      policy,
      resolveKey: createKeyResolver([agent.publicJwk]),
      revocation: makeRevocation(),
      replay: new ReplayCache(),
      ledger: new BudgetLedger(),
      now: NOW,
      nowMs: NOW * 1000,
    },
  };
}

test('signPolicy and loadPolicy verify the provider signature', () => {
  const { provider, policy } = setup();
  assert.equal(policy.id, 'barricade_test_v1');

  const jws = signPolicy(provider.privateJwk, makePolicy(provider));
  const parts = jws.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  assert.throws(
    () => loadPolicy(parts.join('.'), createKeyResolver([provider.publicJwk])),
    /bad_signature/,
  );
});

test('Barricade allows a valid checkout grant and charges observed usage', () => {
  const { agent, options } = setup();
  const events = [];
  const req = reqWith(makePassport(agent).jws);
  const res = fakeRes();
  let nextCalled = false;

  const middleware = barricade({ ...options, onEvent: (e) => events.push(e) });
  const context = middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(context.ok, true);
  assert.equal(req.hallmark.gated, true);
  assert.equal(req.hallmark.surface, 'checkout');
  assert.equal(req.hallmark.capability, CHECKOUT_CAP);
  assert.equal(req.hallmark.gate, 'grant');
  assert.equal(req.hallmark.remaining.req, 5);
  assert.equal(events[0].event, 'passport.accepted');

  req.hallmarkUsage = { req: 1, cost: 250_000 };
  res.finish();

  assert.equal(options.ledger.remaining(req.hallmark.jti).req, 4);
  assert.equal(options.ledger.remaining(req.hallmark.jti).cost, 750_000);
  assert.equal(events[1].event, 'budget.charged');

  const serialized = JSON.stringify(events);
  assert.ok(!serialized.includes('usr_private_should_not_log'));
  assert.ok(!serialized.includes('"ln"'));
});

test('Barricade denies a missing passport with pinned HLM_1005', () => {
  const { options } = setup();
  const req = reqWith(null);
  const res = fakeRes();
  let nextCalled = false;

  barricade(options)(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['www-authenticate'], 'Hallmark error="malformed", hallmark_error="HLM_1005"');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.body.hallmark_error, 'HLM_1005');
  assert.equal(res.body.error, 'malformed');
});

test('Barricade denies a replayed passport with HLM_2004', () => {
  const { agent, options } = setup();
  const { jws } = makePassport(agent);
  const first = evaluateBarricade(reqWith(jws), options);
  assert.equal(first.decision, 'allow');

  const second = evaluateBarricade(reqWith(jws), options);
  assert.equal(second.decision, 'deny');
  assert.equal(second.error.code, 'HLM_2004');
  assert.equal(second.error.reason, 'replay_detected');
});

test('Barricade denies a passport without the surface capability', () => {
  const { agent, options } = setup();
  const { jws } = makePassport(agent, { hlm: { caps: ['vector.search.v1'] } });
  const result = evaluateBarricade(reqWith(jws), options);
  assert.equal(result.decision, 'deny');
  assert.equal(result.error.code, 'HLM_7001');
  assert.equal(result.error.reason, 'capability_unknown');
});

test('Barricade fails closed on a stale revocation set', () => {
  const { agent, options } = setup();
  options.revocation = makeRevocation({ iat: NOW - 1000, exp: NOW + 120 });
  const { jws } = makePassport(agent);
  const result = evaluateBarricade(reqWith(jws), options);
  assert.equal(result.decision, 'deny');
  assert.equal(result.error.code, 'HLM_6004');
  assert.equal(result.event.reason, 'revocation_set_stale');
  assert.equal(result.error.toHTTP().http, 503);
});

test('Barricade passes through routes with no signed surface', () => {
  const { options } = setup();
  const result = evaluateBarricade(reqWith(null, 'GET', '/api/status'), options);
  assert.equal(result.decision, 'passthrough');
  assert.equal(result.context.gated, false);
  assert.equal(result.event, null);
});

test('BudgetLedger refuses duplicate charges and clamps at zero', () => {
  const ledger = new BudgetLedger();
  ledger.initialize('jti-1', { req: 2, cost: 100 });
  assert.equal(ledger.charge('jti-1', 'sqn-1', { req: 1, cost: 80 }), true);
  assert.equal(ledger.charge('jti-1', 'sqn-1', { req: 1, cost: 80 }), false);
  assert.equal(ledger.charge('jti-1', 'sqn-2', { req: 5, cost: 999 }), true);
  assert.deepEqual(ledger.remaining('jti-1'), { req: 0, cost: 0 });
});
