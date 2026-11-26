# @pascaal/freeroam

Observe-only Hallmark attribution for Node providers.

**Status: 0.1.0 draft, not published to npm yet.** This is a product harness,
not a Hallmark L2 conformance gateway. It never denies a request.

## What it does

Freeroam reads a cooperative agent's Hallmark passport from:

- `Authorization: Hallmark <compact-jws>` (spec §12.1), or
- `X-Hallmark-Passport` / `X-Hallmark-JWS` (spec §12.2).

It verifies:

- the closed `EdDSA` / `ES256` algorithm allowlist,
- `typ: hallmark+agent-passport`,
- canonical JSON and the exact signature, using **local pinned keys only**,
- basic claim shape, `nbf ≤ now < exp`, TTL ceiling, audience and tenant,
- the structural `depth == ln.length` tripwire (L1).

It does **not** walk lineage, consult a spawn edge registry, verify an
attestation store, require proof of possession, or make an authorization
decision. Those belong to a conforming gateway.

Every outcome emits an audit-safe event to `onEvent`. `azp`, `ln` and `cnf`
are never included; `jti`/`session` is sufficient for correlation (spec §7.2).

## Install

```bash
npm install @pascaal/freeroam
```

The `@pascaal` scope must be claimed before this package is published. In this
repository, run `npm install` at the root to link the workspace packages.

## Express / Next.js Pages Router

```js
import { freeroam, createKeyResolver } from '@pascaal/freeroam';

app.use('/api', freeroam({
  resolveKey: createKeyResolver([agentPublicJwk]),
  audience: 'https://gw.example.com/',
  tenant: 'tnt_example',
  onEvent: (event) => audit.append(event),
}));
```

The middleware attaches a safe summary to `req.hallmark` and always calls
`next()`. A missing or invalid passport is recorded, not rejected.

## Fastify

```js
import { fastifyFreeroam } from '@pascaal/freeroam';

fastify.addHook('onRequest', fastifyFreeroam(options));
```

## Pure evaluation

For Next.js App Router or any framework with its own response object:

```js
import { evaluateFreeroam } from '@pascaal/freeroam';

const result = evaluateFreeroam(
  { headers: Object.fromEntries(request.headers), method: request.method, url: request.url },
  options,
);
```

`result.decision` is always `passthrough`. Use `result.event` for telemetry.

## Why observe first

Freeroam is the adoption wedge: attribution without accounts or interception.
Barricade adds enforcement at the first *responsible* action, never at first
contact. See [`../../PRODUCT.md`](../../PRODUCT.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE).
