# Hallmark spec

Normative specification for the Hallmark Agent Identity Protocol, plus the
executable reference implementation and its conformance suite.

Protocol home: [hallmark.pascaal.com](https://hallmark.pascaal.com).

> **Branding:** Hallmark is a product of **Pascaal** — AI components for safety
> and adoption (see [`../PASCAAL_BRAND_NOTE.md`](../PASCAAL_BRAND_NOTE.md)).
> "Hallmark" is both the product and the protocol name; `typ`, header and error
> codes all use the `hallmark` prefix and are frozen for v1.

| Document | Purpose |
| --- | --- |
| [`Hallmark-Agent-Identity-Spec.md`](Hallmark-Agent-Identity-Spec.md) | The specification. Normative. |

The spec makes claims that are either measured or asserted by code in this
directory. Nothing in it is decorative.

## Status

**Draft, v1.0, open/executable, §21 open, not ratified.** No production
deployment. Draft `0.1.x` evaluation releases may be tagged `draft` with §21
open; ratification as v1/1.0 still requires §21 closure. The core SDK 0.1.0 is
local and unpublished.

## Verify it

```bash
npm test              # vectors + spec/reference crosscheck; non-zero exit on failure
npm run vectors       # regenerate vectors and self-test, writes vectors.json
npm run bench         # hot-path performance numbers behind spec §17
```

`npm test` runs 38 vectors (6 accept/32 pinned), 4 properties, 4 enforcement
points, and a spec/code crosscheck that asserts the spec and the reference
implementation still describe the same protocol. It exits non-zero if any
invariant weakens.

`vectors.json` contains every generated token alongside its expected and actual
verdict — diff it in review to see exactly what changed.

On a clean checkout, regenerating must touch exactly two lines: the ES256
attestation's `jws` and the ES256 `passport`, differing only in the signature
segment (ES256 uses a random `k`, so its octets rotate every run — §18.3). A
diff that reaches a Seal, a verdict, a header, or the file's structure is a real
change and should be reviewed as one.

Requires Node >= 18. No dependencies.

## Layout

```
Hallmark-Agent-Identity-Spec.md   the specification
crosscheck.mjs                    spec/reference consistency assertions
package.json                      npm scripts
test-vectors/
  hallmark-ref.mjs                JCS, Seal, thumbprints, JWS, revocation, replay, allocation
  verify.mjs                      spawn-edge registry, minting, verifyPassport(), L1-L13
  vectors.mjs                     vector generation and self-test
  bench.mjs                       hot-path measurement
  vectors.json                    generated vectors + verdicts (do not hand-edit)
  make-keys.mjs                   regenerates fixtures/keys.json (run once)
  fixtures/keys.json              published test keys (do not reuse anywhere real)
```

## What is actually enforced

- **Cryptographic** — Ed25519/ES256 only, closed `alg` allowlist, canonical
  JCS payloads, no duplicate JSON members. Keys are pinned locally; no URL or
  remote discovery, and no `jku`/`x5u`/`x5c`.
- **Lineage** — 13 invariants covering parent linkage, ancestry immutability,
  human immutability, tenant isolation, audience narrowing, capability narrowing
  and tree structure.
- **Economic** — disjoint budget slices, so a root's spend cap holds across the
  whole tree with no cross-gateway coordination, even if a parent lies about its
  own bookkeeping.
- **Operational** — TTL ceilings, replay suppression and per-capability
  revocation freshness: strict profiles reject stale data; lower-risk profiles
  may degrade only with an alert. Stated containment window is about 150 seconds
  for a compromised key.

Every action carrying a valid Hallmark passport resolves to one responsible
human. This is not universal attribution: non-cooperating traffic is
unattributed and Hallmark is not a bot detector.

## Two things worth knowing before reading the code

**The Seal covers the signing input, not the signature.** This is deliberate.
P-ECDSA uses a random `k`, so two signatures over identical claims differ. If the
seal covered the signature, every child in a mixed Ed25519/ES256 hierarchy would
be orphaned by its parent. The reference suite asserts this directly
(`seal-excludes-signature`).

**Lineage invariants are enforced at two different strengths.** At spawn the
parent is in hand and all 13 invariants are checked. At request time only the leaf
is usually presented, so the structural invariants are re-checked while the
narrowing invariants are *memoized* in the spawn-edge registry. That is a sound
delegation argument, but only because edge writes are unforgeable. See spec §4
(T7) and §8.5 before implementing.
