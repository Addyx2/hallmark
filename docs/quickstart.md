# Hallmark provider quickstart

**Status: draft product harness, not a ratified standard.** Hallmark v1 is
draft and §21 is open. These packages are built on the v1 primitives; they are
**not** an L2 conformance gateway. Use “Hallmark v1-draft conformant” only for
the spec suite in [`../spec/`](../spec/), never for this middleware.

The first integration target is Express-compatible Node middleware
`(req, res, next)`. The same function works in Express and the Next.js Pages
Router. Small Fastify hooks and a pure evaluator for Next.js App Router are
included.

## The wedge in one paragraph

Run **Freeroam** on read routes: cooperative agents identify themselves, you
record attribution, and nothing is blocked. Run **Barricade** on the first
*responsible* action — purchase, content-use license, destructive operation.
Wall the first responsibility, never first contact.

## Console UI preview

A Supermemory-like console preview runs locally with mocked data:

```bash
npm run start:console   # http://127.0.0.1:4320/
npm run test:console    # static surfaces + agent docs
```

It previews signup/login, organizations and roles, projects and scoped API keys,
agents and grants, Freeroam traffic intelligence, Trackline receipts,
usage/billing and agent-readable docs at `/llms.txt`, `/llms-full.txt` and
`/agent/`. Any email and password opens the demo; nothing is transmitted or
stored. Do not enter real secrets.

Freeroam on the traffic screen observes and flags anomalies; it never denies.
To curb suspicious use, define a signed Barricade surface at the first
responsible action. The full target architecture is in
[`product-architecture.md`](product-architecture.md).

## 1. Install or link

After the `@pascaal` npm scope is claimed:

```bash
npm install @pascaal/hallmark @pascaal/freeroam @pascaal/barricade
```

Until then, use this repository's workspace links:

```bash
npm install          # at the repository root
npm run test:all     # 16 tests: 13 package tests + 3 demo/dashboard tests
```

Node 18 or newer. All three packages are zero-dependency except for each other.

## 2. Run the demo first

```bash
npm run start --workspace @pascaal/provider-demo
```

Open the printed `http://127.0.0.1:<port>/dashboard` URL. The local control room
shows grants, budgets, revocation state, the signed surface policy and safe
audit events. It also lets you mint, run checkout, revoke a session, kill the
lineage and reset the demo. It is a **local preview of Leash + Trackline**, not
the hosted product.

In a second terminal:

```bash
BASE=http://127.0.0.1:<printed-port>

PASSPORT=$(curl -s "$BASE/api/mint" \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).passport")

curl -s "$BASE/api/status"                       # Freeroam: observe, never deny

curl -s -i -X POST "$BASE/api/checkout"          # no grant → 401 HLM_1005
curl -s -i -X POST "$BASE/api/checkout" \
  -H "Authorization: Hallmark $PASSPORT"         # grant → 200
curl -s -i -X POST "$BASE/api/checkout" \
  -H "Authorization: Hallmark $PASSPORT"         # replay → 401 HLM_2004

curl -s "$BASE/api/audit"                        # PII-redacted events
```

`/api/mint` simulates a leash issuing a fresh, short-lived grant for one
action. It is **not** the WebAuthn/OIDC enrollment ceremony from spec §7.1.1.
Keys, policy, revocation state, replay cache and ledger are in memory and
regenerated on every start.

## 3. Configure verifier keys

Keys are pinned locally. No `jku`, `x5u` or `x5c` is ever fetched.

```js
import { createKeyResolver } from '@pascaal/freeroam';

const resolveKey = createKeyResolver([agentPublicJwk]);
// Also accepts a Map, a JWK array, { keys: [...] }, or a resolver function.
```

Private key material is refused by `createKeyResolver()`.

## 4. Express: observe first

```js
import { freeroam } from '@pascaal/freeroam';

app.get('/api/status', freeroam({
  resolveKey,
  audience: 'https://gw.example.com/',
  tenant: 'tnt_example',
  onEvent: (event) => audit.append(event),
}), handler);
```

Freeroam attaches `req.hallmark` and always calls `next()`. Missing, invalid or
malformed passports become `passport.absent` / `passport.rejected` events —
never a denial.

## 5. Express: enforce the responsible action

Sign a provider policy at startup:

```js
import {
  signPolicy, loadPolicy, createKeyResolver as resolveProviderKey,
  RevocationSet, ReplayCache, BudgetLedger,
} from '@pascaal/barricade';

const policyDocument = {
  v: 1,
  id: 'barricade_store_v1',
  tenant: 'tnt_example',
  audience: 'https://gw.example.com/',
  capabilities: {
    'commerce.checkout.v1': {
      methods: ['POST'],
      pathPrefixes: ['/api/checkout'],
      profiles: ['checkout.default.v1'],
      limits: { req: 5, cost: 1_000_000 },
    },
  },
  surfaces: [{
    id: 'checkout',
    gate: 'grant',
    tier: 1,
    capability: 'commerce.checkout.v1',
    methods: ['POST'],
    pathPrefixes: ['/api/checkout'],
    revocation: 'strict',
    maxStalenessSec: 30,
  }],
};

const policy = loadPolicy(
  signPolicy(providerPrivateJwk, policyDocument),
  resolveProviderKey([providerPublicJwk]),
);
```

Then mount it:

```js
import { barricade } from '@pascaal/barricade';

const replay = new ReplayCache();
const ledger = new BudgetLedger();
const revocation = new RevocationSet(manifest); // locally pinned, fresh

app.post('/api/checkout', barricade({
  policy,
  resolveKey,
  revocation,
  replay,
  ledger,
  onEvent: (event) => audit.append(event),
}), (req, res) => {
  // Report observed usage; the middleware charges it on response finish.
  req.hallmarkUsage = { req: 1, cost: 250_000 };
  res.json({ ok: true, remaining: ledger.remaining(req.hallmark.jti) });
});
```

Unmatched routes pass through. A matched route denies with the pinned `HLM_`
body, `Cache-Control: no-store` and `WWW-Authenticate: Hallmark ...`.

## 6. Next.js and Fastify

**Pages Router:** use the Express middleware exactly as above in an API route.

**App Router:** use the pure evaluator in a route handler:

```js
import { evaluateBarricade } from '@pascaal/barricade';

const result = evaluateBarricade(
  { headers: Object.fromEntries(request.headers), method: request.method, url: request.url },
  options,
);
if (result.decision === 'deny') {
  const { http, body } = result.error.toHTTP();
  return Response.json(body, { status: http });
}
```

**Fastify:**

```js
import { fastifyFreeroam } from '@pascaal/freeroam';
import { fastifyBarricade } from '@pascaal/barricade';

fastify.addHook('onRequest', fastifyFreeroam(observeOptions));
fastify.addHook('onRequest', fastifyBarricade(enforceOptions));
```

Fastify handlers call `await request.hallmarkCharge({ req: 1, cost })`; no
automatic `finish` hook is installed there.

## 7. What these packages verify — and what they do not

**Verified here**

- `EdDSA` / `ES256` allowlist, `typ` pinning, no remote key headers (V1).
- Exact signature over canonical JSON, duplicate members rejected (V2).
- Basic claim shape, `nbf ≤ now < exp`, TTL ceiling, audience, tenant.
- Structural `depth == ln.length` (L1).
- Signed provider policy, surface match, capability/method/path/profile (§9).
- `jti` cache plus `sqn` window (§11).
- Revocation freshness and local denylist checks (§10).
- Observed-usage budget charging with idempotency keys (§9.2).

**Not verified here — required before production or an L2 claim**

- Full ancestry walk and spawn edge registry (§8.5–8.6).
- Attestation store and root signer binding (V5).
- Proof of possession for `cnf`-bound passports (V10).
- Signed revocation manifest signature verification.
- Response-chained, timestamped audit log (§14).
- OIDC/WebAuthn enrollment ceremony (§7.1.1).
- A managed registry, key custody, rotation and recovery.

There is no OpenAPI contract yet. `docs/openapi.json` is Phase 3 and will not
be invented before the managed service exists.

## 8. Conformance wording

For the spec suite: **Hallmark v1-draft conformant — 38/38 vectors — spec
commit `<sha>`**. See [`../CONFORMANCE.md`](../CONFORMANCE.md).

For these packages: **draft product harness built on Hallmark v1 primitives**.
Do not say ratified, certified, production-deployed, bot detection or DRM.
