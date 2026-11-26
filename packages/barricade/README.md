# @pascaal/barricade

Provider-side Hallmark enforcement for Node.

**Status: 0.1.0 draft, not published to npm yet.** This is a product harness,
not a Hallmark L2 conformance gateway. It denies only on a signed surface —
the first responsible action, never first contact.

## What it does

Barricade wraps Freeroam's verification and adds:

- a signed `hallmark+barricade-policy` describing surfaces × gates × tiers,
- a hard denial on a matched surface,
- pinned `HLM_` error codes and HTTP statuses from spec §16.1,
- local-only key resolution — no `jku`, `x5u` or `x5c`,
- replay suppression via `jti` cache plus `sqn` window,
- fail-closed revocation freshness for `grant` surfaces,
- capability / method / path / profile authorization (spec §9.3–9.4),
- an in-memory budget ledger charged from **observed** usage on response finish.

It does **not** walk lineage, consult an attestation store, verify a signed
revocation manifest, require proof of possession, or persist audit state.
Those are required before a production deployment or an L2 claim.

## Policy shape

The policy is a draft product artifact, not a normative protocol claim:

```js
const policy = {
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
  surfaces: [
    {
      id: 'checkout',
      gate: 'grant',
      tier: 1,
      capability: 'commerce.checkout.v1',
      methods: ['POST'],
      pathPrefixes: ['/api/checkout'],
      revocation: 'strict',
      maxStalenessSec: 30,
    },
  ],
};
```

Sign it with the provider key, then verify it at startup:

```js
import { signPolicy, loadPolicy, createKeyResolver } from '@pascaal/barricade';

const policyJws = signPolicy(providerPrivateJwk, policy);
const verifiedPolicy = loadPolicy(policyJws, createKeyResolver([providerPublicJwk]));
```

## Express / Next.js Pages Router

```js
import {
  barricade, createKeyResolver, ReplayCache, RevocationSet,
} from '@pascaal/barricade';

app.post('/api/checkout', barricade({
  policy: verifiedPolicy,
  resolveKey: createKeyResolver([agentPublicJwk]),
  revocation: new RevocationSet(manifest),
  replay: new ReplayCache(),
  onEvent: (event) => audit.append(event),
}), handler);
```

On denial the middleware writes the pinned `HLM_` body, sets `Cache-Control:
no-store` and `WWW-Authenticate: Hallmark ...`, and does not call `next()`.

On allow it attaches `req.hallmark` and registers a `finish` listener. Set
`req.hallmarkUsage = { req: 1, cost: 1234 }` in your handler if you want
observed cost charged; otherwise `{ req: 1 }` is used.

## Fastify

```js
import { fastifyBarricade } from '@pascaal/barricade';

fastify.addHook('onRequest', fastifyBarricade(options));
```

Fastify handlers can call `await request.hallmarkCharge({ req: 1, cost })`.
No automatic `finish` hook is installed for Fastify.

## Next.js App Router

Use `evaluateBarricade({ headers, method, url }, options)` inside the route
handler and translate `decision === 'deny'` with `error.toHTTP()`.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
