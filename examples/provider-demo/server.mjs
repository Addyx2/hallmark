// Runnable Freeroam → Barricade provider demo.
// Draft product harness. Not a Hallmark L2 conformance gateway and not an
// enrollment ceremony: /api/mint simulates a leash issuing a per-action grant.

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';

import { jwsSign, jkt, kid, seal } from '@pascaal/hallmark';
import { freeroam, createKeyResolver } from '@pascaal/freeroam';
import {
  barricade, signPolicy, loadPolicy,
  RevocationSet, ReplayCache, BudgetLedger,
} from '@pascaal/barricade';

const TENANT = 'tnt_hallmark_demo';
const AUDIENCE = 'https://gw.hallmark-demo.example/';
const CHECKOUT_CAP = 'commerce.checkout.v1';
const ROOT_ATTESTATION_ID = 'at_demo_0001';
const ROOT_BUDGET = { req: 20, tin: 32768, tout: 8192, cost: 5_000_000, conc: 8, depth: 4, wid: 8 };
const GRANT_BUDGET = { req: 5, tin: 8192, tout: 2048, cost: 1_000_000, conc: 1, depth: 0, wid: 0 };

function ed25519() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateJwk: pair.privateKey.export({ format: 'jwk' }),
    publicJwk: pair.publicKey.export({ format: 'jwk' }),
  };
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

/** Create and start a self-contained demo provider. */
export async function createDemo({ port = 0 } = {}) {
  const provider = ed25519();
  const agent = ed25519();
  const idp = ed25519();
  const audit = [];
  const replay = new ReplayCache();
  const ledger = new BudgetLedger();
  let grantCounter = 0;

  const pushEvent = (event) => {
    audit.push(event);
    if (audit.length > 200) audit.shift();
  };

  const policyDocument = {
    v: 1,
    id: 'barricade_demo_store_v1',
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
  const policyJws = signPolicy(provider.privateJwk, policyDocument);
  const policy = loadPolicy(policyJws, createKeyResolver([provider.publicJwk]));

  const revocation = new RevocationSet({
    v: 1, iat: nowSec(), exp: nowSec() + 120,
    keys: [], sessions: [], attestations: [], tenants: [],
  });
  const refreshRevocation = () => {
    revocation.v += 1;
    revocation.iat = nowSec();
    revocation.exp = nowSec() + 120;
  };

  const identity = {
    resolveKey: createKeyResolver([agent.publicJwk]),
    audience: AUDIENCE,
    tenant: TENANT,
  };
  const observe = freeroam({ ...identity, onEvent: pushEvent });
  const enforce = barricade({
    ...identity,
    policy,
    revocation,
    replay,
    ledger,
    onEvent: pushEvent,
  });

  function mintPassport() {
    const now = nowSec();
    grantCounter += 1;
    const attestation = {
      iss: 'https://idp.hallmark-demo.example/',
      sub: 'usr_demo_4471',
      aud: AUDIENCE,
      iat: now,
      nbf: now,
      exp: now + 120,
      jti: ROOT_ATTESTATION_ID,
      amr: ['hwk', 'user_presence'],
      cnf: { jkt: jkt(agent.publicJwk) },
      hlm: {
        v: 1,
        tid: TENANT,
        agent: { spid: 'spid://demo/orchestrator', name: 'Demo Orchestrator', caps: [CHECKOUT_CAP] },
        pol: { id: 'pol_demo_v1', v: 1 },
        budget: ROOT_BUDGET,
      },
    };
    const { jws: attestationJws } = jwsSign('EdDSA', idp.privateJwk, {
      typ: 'hallmark+root-attestation',
      kid: kid(idp.publicJwk),
    }, attestation);
    const rootSeal = seal(attestationJws);

    const claims = {
      iss: `urn:hallmark:root:${TENANT}`,
      sub: `ses_demo_${grantCounter}`,
      jti: `grant_demo_${grantCounter}`,
      aud: AUDIENCE,
      azp: 'usr_demo_4471',
      amr: ['agent_delegation'],
      iat: now,
      nbf: now,
      exp: now + 60,
      sqn: grantCounter,
      hlm: {
        v: 1,
        tid: TENANT,
        spid: 'spid://demo/checkout-agent',
        name: 'Demo Checkout Agent',
        prof: 'checkout.default.v1',
        caps: [CHECKOUT_CAP],
        depth: 1,
        ln: [{ sid: ROOT_ATTESTATION_ID, h: rootSeal }],
        root: {
          at: ROOT_ATTESTATION_ID,
          h: rootSeal,
          iss: 'https://idp.hallmark-demo.example/',
          sub: 'usr_demo_4471',
        },
        budget: GRANT_BUDGET,
        pol: { id: 'pol_demo_v1', v: 1 },
      },
    };
    const { jws } = jwsSign('EdDSA', agent.privateJwk, {
      typ: 'hallmark+agent-passport',
      kid: kid(agent.publicJwk),
    }, claims);

    return {
      passport: jws,
      attestation: attestationJws,
      jti: claims.jti,
      kid: kid(agent.publicJwk),
      expiresAt: claims.exp,
    };
  }

  function run(middleware, req, res, next) {
    const fail = (err) => {
      if (!res.writableEnded) {
        sendJson(res, 500, { error: 'middleware_error', detail: String(err && err.message || err) });
      }
    };
    try {
      middleware(req, res, () => {
        try { Promise.resolve(next()).catch(fail); } catch (err) { fail(err); }
      });
    } catch (err) { fail(err); }
  }

  const server = http.createServer(async (req, res) => {
    refreshRevocation();
    const path = req.url.split('?')[0];

    if (path === '/' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end([
        'Pascaal provider demo — Freeroam observes, Barricade enforces.',
        '',
        '  1. GET  /api/mint                          # simulate a leash-issued grant',
        '  2. GET  /api/status                        # observe-only, no credential required',
        '  3. curl -X POST /api/checkout -H "Authorization: Hallmark <passport>"',
        '  4. GET  /api/audit                         # safe, PII-redacted events',
        '',
        'Draft product harness. Not ratified. Not an enrollment ceremony.',
        '',
      ].join('\n'));
      return;
    }

    if (path === '/api/mint' && req.method === 'GET') {
      sendJson(res, 200, mintPassport());
      return;
    }

    if (path === '/api/status' && req.method === 'GET') {
      run(observe, req, res, () => sendJson(res, 200, { ok: true, hallmark: req.hallmark }));
      return;
    }

    if (path === '/api/checkout' && req.method === 'POST') {
      run(enforce, req, res, async () => {
        const body = await readBody(req);
        req.hallmarkUsage = { req: 1, cost: 250_000 };
        sendJson(res, 200, {
          ok: true,
          order: { id: `ord_demo_${grantCounter}`, item: body.item || 'starter-plan' },
          hallmark: req.hallmark,
          remaining: ledger.remaining(req.hallmark.jti),
        });
      });
      return;
    }

    if (path === '/api/audit' && req.method === 'GET') {
      sendJson(res, 200, { events: audit });
      return;
    }

    sendJson(res, 404, { error: 'not_found', path });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return {
    server,
    port: server.address().port,
    audit,
    policy,
    policyJws,
    mintPassport,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = await createDemo();
  const base = `http://127.0.0.1:${demo.port}`;
  process.stdout.write(`Pascaal provider demo listening on ${base}\n`);
  process.stdout.write(`Policy JWS: ${demo.policyJws.slice(0, 64)}...\n`);
  process.stdout.write(`Try: curl ${base}/api/mint\n`);
}
