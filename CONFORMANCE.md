# Hallmark conformance

Hallmark v1 is **draft, not ratified, with no production deployment**. Conformance claims must say so.

## Source of truth

[`spec/Hallmark-Agent-Identity-Spec.md`](spec/Hallmark-Agent-Identity-Spec.md) is normative.
The reference implementation in `spec/test-vectors/` is executable evidence, not a second spec.
Where prose and code disagree, prose wins and the file is a bug.

## What the suite proves

Run from `spec/`:

```bash
npm test
```

That runs:

- **38 vectors** — 6 accept, 32 pinned to an exact `HLM_` error code.
- **46 checks** across those vectors.
- **4 design properties** — Seal excludes signature, JCS member ordering,
  canonicalization sensitivity, domain separation.
- **4 budget enforcement points** — overlap refused, root cap survives a lying
  parent, observed usage charged, slices not shared.
- **spec/code crosscheck** — every cited `V#`, `L#`, `T#` and `HLM_` in the spec
  exists in code and vice versa.

`vectors.json` is generated. On a clean checkout, regeneration should touch only
the two ES256 signature segments, because ES256 uses a random `k`. A diff that
reaches a Seal, a verdict, a header or the file structure is a real change.

## Conformance levels

| Level | Claim | Requirements |
| --- | --- | --- |
| L0 | Uses Hallmark primitives | Imports or reproduces base64url, restricted JCS, Seal, `jkt` and the closed algorithm allowlist from the same spec version |
| L1 | Verifies Hallmark v1 passports | `jwsVerify` behaviour: algorithm allowlist, `typ` pinning, no `jku`/`x5u`/`x5c`, local `kid` resolution, strict canonical JSON, signature verification |
| L2 | Hallmark v1-draft conformant gateway | L1 + all 38 vectors + L1–L13 lineage invariants + disjoint budgets + replay suppression + fail-closed revocation freshness |

## How to claim L2

Publish all of the following:

1. Protocol version: `Hallmark v1-draft`.
2. Commit hash of the spec/reference used.
3. `npm test` result — `38/38 vectors`, crosscheck clean.
4. Algorithms accepted: `EdDSA`, `ES256`. Nothing else.
5. Key resolution model: local registry only; no remote key headers.
6. Revocation profile: `failClosed` or `bounded + alert`, with max staleness.
7. Budget model: disjoint slices, charged on observed usage.
8. A link to your implementation and a contact for reports.

Suggested badge text:

> Hallmark v1-draft conformant — 38/38 vectors — spec commit `<sha>`

## Claims you must not make

- "Ratified", "certified" or "standard" — v1 is draft and §21 is open.
- "Production-deployed" unless you are actually running it in production and say where.
- "Prevents copying" — a Seal makes copying detectable and attributable, not impossible.
- "Bot detection" — Hallmark resolves responsibility; it does not classify behavior.
- "Supports all JWT algorithms" — the allowlist is closed.

## Scope

Conformance covers the protocol and gateway behaviour. It does not certify the
security of a hosting provider, a user's key custody, or a WordPress site.

The Phase 2 provider packages (`@pascaal/freeroam`, `@pascaal/barricade`) are a
**draft product harness**, not a conformance submission. They reuse v1
primitives and pinned error codes, but do not implement the full §16 sequence:
lineage anchoring, attestation resolution, PoP, signed revocation manifests and
a chained audit log are still outside them. Describe them as “built on Hallmark
v1 primitives”, never as “v1-draft conformant gateway”.
