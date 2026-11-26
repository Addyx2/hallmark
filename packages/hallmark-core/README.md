# @pascaal/hallmark

Core primitives for the Hallmark Agent Identity Protocol v1.

**Status: 0.1.0 draft, not published to npm yet.** The `@pascaal` scope must be
claimed first. The protocol is draft v1, not ratified, with no production
deployment. See [`../../SECURITY.md`](../../SECURITY.md).

This package is a semantic copy of
[`spec/test-vectors/hallmark-ref.mjs`](../../spec/test-vectors/hallmark-ref.mjs).
Only the header comment changed. The normative spec is
[`spec/Hallmark-Agent-Identity-Spec.md`](../../spec/Hallmark-Agent-Identity-Spec.md).

## Install

```bash
npm install @pascaal/hallmark
```

Zero dependencies. Node 18 or newer.

## Use

```js
import {
  b64u, jcs, seal, jkt, kid,
  jwsSign, jwsVerify, HallmarkError,
  RevocationSet, ReplayCache, AllocationStore,
} from '@pascaal/hallmark';

const signingInput = `${b64u(jcs({ alg: 'EdDSA' }))}.${b64u(jcs({ sub: 'usr_4471' }))}`;
const sealValue = seal(signingInput);
```

`jwsVerify(jws, expectedTyp, resolveKey)` verifies:

- the closed `EdDSA` / `ES256` allowlist,
- `typ` pinning,
- no `jku`, `x5u` or `x5c`,
- a local `kid` resolution callback — never network I/O,
- strict canonical JSON with duplicate-member rejection,
- the exact signature over the exact signing input.

Any failure throws `HallmarkError` with a pinned `HLM_` code. `error.toHTTP()`
returns `{ http, body }` for gateway use.

## CLI

```bash
hallmark self-test
hallmark verify <jws> --key ./public-jwk.json [--typ hallmark+root-attestation]
hallmark --version
```

The key file may be a single JWK, an array of JWKs, or `{ "keys": [...] }`.
No remote key lookup is performed.

## What this package is not

- Not the full conformance suite. Run `npm test` in `spec/` for that.
- Not a gateway, registry, attestation minting service or user app.
- Not a ratified standard.
- Not a bot detector or DRM.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
