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

- **38 vectors (6 accept/32 pinned)** — the 32 negatives are pinned to an exact
  `HLM_` error code.
- **4 properties** — Seal excludes signature, JCS member ordering,
  canonicalization sensitivity, domain separation.
- **4 enforcement points** — overlap refused, root cap survives a lying parent,
  observed usage charged, slices not shared.
- **spec/code crosscheck** — every cited `V#`, `L#`, `T#` and `HLM_` in the spec
  exists in code and vice versa.

`vectors.json` is generated. On a clean checkout, regeneration should touch only
the two ES256 signature segments, because ES256 uses a random `k`. A diff that
reaches a Seal, a verdict, a header or the file structure is a real change.

## Conformance levels

Following spec §18.1, with L0 added for the primitive layer:

| Level | Claim | Requirements |
| --- | --- | --- |
| L0 | Uses Hallmark primitives | base64url, restricted JCS, Seal, `jkt` and the closed algorithm allowlist from the same spec version; TypeScript declarations for the exported primitives |
| L1 | Verifies Hallmark v1 passports | L0 + `jwsVerify` behaviour: algorithm allowlist, `typ` pinning, no `jku`/`x5u`/`x5c` and no URL/remote discovery, local `kid` resolution, strict canonical JSON, signature verification |
| L2 | Revocation and pinning | L1 + `V8` revocation with freshness, audience and tenant pinning; keys pinned locally, never discovered remotely; strict profiles reject stale data, lower-risk profiles may degrade only with an alert |
| L3 | Full gateway/product enforcement | L2 + `V7` lineage (L1–L13), `L10` disjoint budgets, `V9` route authorization, replay suppression and signed-surface policy; all 38 vectors and the spec/code crosscheck |
| L4 | Full zero-trust claim | L3 + mTLS/decoy enforcement, proof of possession and audit export |

L3 is the floor for product enforcement claims; L4 is what supports a
zero-trust claim. The provider packages in this repository are a draft harness,
not an L3 gateway.

## How to claim L3 (full gateway/product enforcement)

Publish all of the following:

1. Protocol version: `Hallmark v1-draft`.
2. Commit hash of the spec/reference used.
3. `npm test` result — `38/38 vectors`, crosscheck clean.
4. Algorithms accepted: `EdDSA`, `ES256`. Nothing else.
5. Key resolution model: keys pinned locally; no URL/remote discovery and no
   remote key headers.
6. Revocation profile: strict (`failClosed`) rejects stale data; lower-risk
   (`bounded + alert`) may degrade only with an alert; state max staleness.
7. Budget model: disjoint slices, charged on observed usage.
8. A link to your implementation and a contact for reports.

Suggested badge text:

> Hallmark v1-draft conformant — 38/38 vectors — spec commit `<sha>`

Every action carrying a valid Hallmark passport resolves to one responsible
human. Do not claim universal attribution: non-cooperating traffic is
unattributed, and Hallmark is the protocol, not a bot detector.

## Claims you must not make

- "Ratified", "certified" or "the standard" — v1 is draft and §21 is open; call
  Hallmark the protocol.
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
