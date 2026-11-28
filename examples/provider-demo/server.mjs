// Runnable Freeroam → Barricade provider demo, with a local control-room view.
// Draft product harness. Not a Hallmark L2 conformance gateway and not an
// enrollment ceremony: /api/mint simulates a leash issuing a per-action grant.
// POST /api/mint is preferred; GET remains an intentional local-only shortcut
// for curl and the documented walkthrough (it signs ephemeral demo keys only).
// The dashboard is in-memory only: no accounts, no persistence, no hosted service.
// /api/dashboard/clock can freeze the revocation manifest and advance a
// simulated clock so strict enforcement demonstrably fails closed (HLM_6004).

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
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
const RESPONSIBLE_HUMAN = 'usr_demo_4471';
const ROOT_BUDGET = { req: 20, tin: 32768, tout: 8192, cost: 5_000_000, conc: 8, depth: 4, wid: 8 };
const GRANT_BUDGET = { req: 5, tin: 8192, tout: 2048, cost: 1_000_000, conc: 1, depth: 0, wid: 0 };

const STATIC_FILES = new Map([
  ['/dashboard', 'public/index.html'],
  ['/dashboard/', 'public/index.html'],
  ['/dashboard/styles.css', 'public/styles.css'],
  ['/dashboard/app.js', 'public/app.js'],
]);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

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

function sendJson(res, status, body, head = false) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(head ? undefined : JSON.stringify(body, null, 2));
}

function sendText(res, status, text, head = false) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(head ? undefined : text);
}

async function sendStatic(res, file, head = false) {
  const body = await readFile(new URL(file, import.meta.url));
  res.statusCode = 200;
  res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.end(head ? undefined : body);
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

/** Create and start a self-contained demo provider with a local dashboard. */
export async function createDemo({ port = 0 } = {}) {
  const provider = ed25519();
  const agent = ed25519();
  const idp = ed25519();
  const agentKey = jkt(agent.publicJwk);
  const audit = [];
  const grants = new Map();
  const replay = new ReplayCache();
  const ledger = new BudgetLedger();
  let grantCounter = 0;
  let lineageKilled = false;
  let revocationFrozen = false;
  let clockOffsetSec = 0;

  const pushEvent = (event) => {
    audit.push(event);
    if (audit.length > 200) audit.shift();
  };
  // Counters are monotonic and independent of the 200-event audit ring buffer.
  const counters = { minted: 0, observed: 0, accepted: 0, denied: 0, charged: 0 };
  const recordEvent = (event) => {
    pushEvent(event);
    if (event.event === 'passport.observed' || event.event === 'passport.absent') counters.observed += 1;
    if (event.event === 'passport.accepted') counters.accepted += 1;
    // Barricade denials carry a gate; Freeroam's rejected observations do not.
    if (event.event === 'passport.rejected' && event.gate) counters.denied += 1;
    if (event.event === 'budget.charged') counters.charged += 1;
  };
  const controlEvent = (event, fields = {}) => {
    pushEvent({ ts: Date.now(), event, ...fields });
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
  // A local simulated clock affects only revocation freshness checks, never
  // passport verification time. Advancing it past maxStalenessSec exercises
  // the strict fail-closed path without expiring the passport itself.
  const baseCheckFreshness = revocation.checkFreshness.bind(revocation);
  revocation.checkFreshness = (now, maxStalenessSec, failClosed) =>
    baseCheckFreshness(now + clockOffsetSec, maxStalenessSec, failClosed);

  const identity = {
    resolveKey: createKeyResolver([agent.publicJwk]),
    audience: AUDIENCE,
    tenant: TENANT,
  };
  const observe = freeroam({ ...identity, onEvent: recordEvent });
  const enforce = barricade({
    ...identity,
    policy,
    revocation,
    replay,
    ledger,
    onEvent: recordEvent,
  });

  function mintPassport() {
    const now = nowSec();
    grantCounter += 1;
    const attestation = {
      iss: 'https://idp.hallmark-demo.example/',
      sub: RESPONSIBLE_HUMAN,
      aud: AUDIENCE,
      iat: now,
      nbf: now,
      exp: now + 120,
      jti: ROOT_ATTESTATION_ID,
      amr: ['hwk', 'user_presence'],
      cnf: { jkt: agentKey },
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
      azp: RESPONSIBLE_HUMAN,
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
          sub: RESPONSIBLE_HUMAN,
        },
        budget: GRANT_BUDGET,
        pol: { id: 'pol_demo_v1', v: 1 },
      },
    };
    const { jws } = jwsSign('EdDSA', agent.privateJwk, {
      typ: 'hallmark+agent-passport',
      kid: kid(agent.publicJwk),
    }, claims);

    grants.set(claims.jti, {
      jti: claims.jti,
      session: claims.sub,
      sqn: claims.sqn,
      attestation: ROOT_ATTESTATION_ID,
      spid: claims.hlm.spid,
      name: claims.hlm.name,
      issuedAt: now,
      expiresAt: claims.exp,
      status: 'minted',
      usedAt: null,
      remaining: { ...GRANT_BUDGET },
      charged: { req: 0, cost: 0 },
    });
    counters.minted += 1;

    return {
      passport: jws,
      attestation: attestationJws,
      jti: claims.jti,
      session: claims.sub,
      sqn: claims.sqn,
      kid: kid(agent.publicJwk),
      expiresAt: claims.exp,
      spid: claims.hlm.spid,
    };
  }

  function revokeSession(session, reason = 'operator_revoked') {
    if (typeof session !== 'string' || !session) return false;
    const grantsAffected = [...grants.values()].filter((grant) => grant.session === session);
    revocation.sessions.add(session);
    for (const grant of grantsAffected) grant.status = 'revoked';
    refreshRevocation();
    controlEvent('grant.revoked', {
      session,
      jti: grantsAffected[0] && grantsAffected[0].jti,
      reason,
    });
    return true;
  }

  function killLineage() {
    lineageKilled = true;
    revocation.attestations.add(ROOT_ATTESTATION_ID);
    for (const grant of grants.values()) {
      revocation.sessions.add(grant.session);
      grant.status = 'revoked';
    }
    refreshRevocation();
    controlEvent('lineage.killed', {
      attestation: ROOT_ATTESTATION_ID,
      grants: grants.size,
      reason: 'operator_kill',
    });
    return true;
  }

  function resetDemo() {
    revocation.keys.clear();
    revocation.sessions.clear();
    revocation.attestations.clear();
    revocation.tenants.clear();
    replay.seenJti.clear();
    replay.hwm.clear();
    replay.order.length = 0;
    ledger.byJti.clear();
    ledger.charged.clear();
    grants.clear();
    audit.length = 0;
    grantCounter = 0;
    lineageKilled = false;
    revocationFrozen = false;
    clockOffsetSec = 0;
    for (const key of Object.keys(counters)) counters[key] = 0;
    refreshRevocation();
    controlEvent('demo.reset', { tenant: TENANT });
    return true;
  }

  function snapshot() {
    const now = nowSec() + clockOffsetSec;
    const grantRows = [...grants.values()].map((grant) => ({
      ...grant,
      remaining: ledger.remaining(grant.jti),
      revoked: revocation.sessions.has(grant.session)
        || revocation.attestations.has(grant.attestation),
    }));

    return {
      generatedAt: new Date().toISOString(),
      mode: 'local-demo',
      tenant: TENANT,
      audience: AUDIENCE,
      agent: {
        name: 'Demo Checkout Agent',
        spid: 'spid://demo/checkout-agent',
        key: agentKey,
        kid: kid(agent.publicJwk),
      },
      imprint: {
        id: ROOT_ATTESTATION_ID,
        responsibleHuman: RESPONSIBLE_HUMAN,
        issuer: 'https://idp.hallmark-demo.example/',
        killed: lineageKilled,
        budget: ROOT_BUDGET,
      },
      policy: {
        id: policy.id,
        vault: policyJws.slice(0, 48),
        surface: policy.surfaces[0],
        capabilities: policy.capabilities,
      },
      revocation: {
        version: revocation.v,
        issuedAt: revocation.iat,
        expiresAt: revocation.exp,
        ageSec: Math.max(0, now - revocation.iat),
        frozen: revocationFrozen,
        clockOffsetSec,
        maxStalenessSec: policy.surfaces[0].maxStalenessSec,
        keys: [...revocation.keys],
        sessions: [...revocation.sessions],
        attestations: [...revocation.attestations],
        tenants: [...revocation.tenants],
      },
      grants: grantRows,
      // Monotonic totals; the audit list below is a bounded ring buffer.
      counters: { ...counters },
      audit: audit.slice().reverse(),
      boundary: {
        label: 'Draft product harness',
        conformance: 'Not L2 conformance. Not ratified.',
        persistence: 'In-memory only. Restarting the process resets all state.',
        topology: 'No accounts, no hosted registry, no signed revocation manifest.',
      },
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
    if (!revocationFrozen) refreshRevocation();
    const path = req.url.split('?')[0];
    const head = req.method === 'HEAD';

    if (path === '/favicon.ico' && (req.method === 'GET' || head)) {
      // The dashboard uses an inline data-URI icon; probes stay off the 404 path.
      res.statusCode = 204;
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }

    if (STATIC_FILES.has(path) && (req.method === 'GET' || head)) {
      try {
        await sendStatic(res, STATIC_FILES.get(path), head);
      } catch (err) {
        sendJson(res, 500, { error: 'static_read_failed', detail: String(err && err.message || err) }, head);
      }
      return;
    }

    if (path === '/' && (req.method === 'GET' || head)) {
      res.statusCode = 302;
      res.setHeader('Location', '/dashboard');
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }

    if (path === '/api/help' && (req.method === 'GET' || head)) {
      sendText(res, 200, [
        'Pascaal provider demo — Freeroam observes, Barricade enforces.',
        '',
        '  Dashboard  /dashboard',
        '  1. POST /api/mint                          # simulate a leash-issued grant',
        '     (GET /api/mint is an intentional local preview shortcut for curl)',
        '  2. GET  /api/status                        # observe-only, no credential required',
        '  3. curl -X POST /api/checkout -H "Authorization: Hallmark <passport>"',
        '  4. GET  /api/audit                         # safe, PII-redacted events',
        '  5. POST /api/dashboard/revoke              # revoke a grant session or kill the lineage',
        '  6. POST /api/dashboard/clock               # { action: "freeze" | "advance" | "resume" }',
        '                                             # freeze + advance 60s => HLM_6004 on checkout',
        '  7. POST /api/dashboard/reset               # restore the demo state',
        '',
        'Costs are mock cost units (100 units = $1). No billing is connected.',
        'Crypto vectors are spec-wide, not specific to this harness.',
        'Use the Location header from GET / to find the dashboard.',
        'Draft product harness. Not ratified. Not an enrollment ceremony.',
        '',
      ].join('\n'), head);
      return;
    }

    if (path === '/api/dashboard' && (req.method === 'GET' || head)) {
      sendJson(res, 200, snapshot(), head);
      return;
    }

    if (path === '/api/dashboard/revoke' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.action === 'kill-lineage') {
        killLineage();
      } else if (body.kind === 'session' && revokeSession(body.id)) {
        // Already applied.
      } else {
        sendJson(res, 400, { error: 'invalid_revocation', hint: 'Use { action: "kill-lineage" } or { kind: "session", id: "<session>" }' });
        return;
      }
      sendJson(res, 200, { ok: true, snapshot: snapshot() });
      return;
    }

    if (path === '/api/dashboard/clock' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.action === 'freeze') {
        revocationFrozen = true;
        controlEvent('revocation.frozen', { at: revocation.iat });
      } else if (body.action === 'advance') {
        const seconds = Number.isFinite(body.seconds) ? body.seconds : 60;
        clockOffsetSec = Math.max(0, Math.min(3600, clockOffsetSec + seconds));
        controlEvent('clock.advanced', { offsetSec: clockOffsetSec });
      } else if (body.action === 'resume') {
        revocationFrozen = false;
        clockOffsetSec = 0;
        refreshRevocation();
        controlEvent('clock.resumed', { offsetSec: 0 });
      } else {
        sendJson(res, 400, {
          error: 'invalid_clock_action',
          hint: 'Use { action: "freeze" | "advance" | "resume" }',
        });
        return;
      }
      sendJson(res, 200, { ok: true, snapshot: snapshot() });
      return;
    }

    if (path === '/api/dashboard/reset' && req.method === 'POST') {
      resetDemo();
      sendJson(res, 200, { ok: true, snapshot: snapshot() });
      return;
    }

    // POST is the intentional state-changing route. GET is kept as a documented
    // local preview shortcut; neither touches a real key, registry or service.
    if (path === '/api/mint' && (req.method === 'POST' || req.method === 'GET')) {
      sendJson(res, 200, mintPassport(), head);
      return;
    }

    if (path === '/api/status' && (req.method === 'GET' || head)) {
      run(observe, req, res, () => sendJson(res, 200, { ok: true, hallmark: req.hallmark }, head));
      return;
    }

    if (path === '/api/checkout' && req.method === 'POST') {
      run(enforce, req, res, async () => {
        const body = await readBody(req);
        const jti = req.hallmark.jti;
        req.hallmarkUsage = { req: 1, cost: 250_000 };
        res.once('finish', () => {
          const grant = grants.get(jti);
          if (!grant) return;
          grant.status = 'used';
          grant.usedAt = Date.now();
          grant.remaining = ledger.remaining(jti);
          grant.charged = {
            req: (grant.charged.req || 0) + 1,
            cost: (grant.charged.cost || 0) + 250_000,
          };
        });
        sendJson(res, 200, {
          ok: true,
          order: { id: `ord_demo_${grantCounter}`, item: body.item || 'starter-plan' },
          hallmark: req.hallmark,
          remaining: ledger.remaining(jti),
        });
      });
      return;
    }

    if (path === '/api/audit' && (req.method === 'GET' || head)) {
      sendJson(res, 200, { events: audit }, head);
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
    grants,
    policy,
    policyJws,
    revocation,
    replay,
    ledger,
    mintPassport,
    snapshot,
    controlEvent,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = await createDemo();
  const base = `http://127.0.0.1:${demo.port}`;
  process.stdout.write(`Pascaal Hallmark demo: ${base}/dashboard\n`);
  process.stdout.write(`API help: ${base}/api/help\n`);
  process.stdout.write(`Policy JWS: ${demo.policyJws.slice(0, 64)}...\n`);
  process.stdout.write('Draft product harness. In-memory only. Not ratified.\n');
}
