# Security policy

## Current status

Hallmark is **draft v1, not ratified, with no production deployment**. The
reference implementation, `packages/hallmark-core`, `packages/freeroam` and
`packages/barricade` are suitable for evaluation, integration work and
conformance testing. The provider packages are a draft harness, not L2 gateway:
they do not walk lineage, resolve attestations, require PoP, verify signed
revocation manifests, or persist a chained audit log. Do not treat them as a
production authorization decision until spec §21 is closed and your own threat
model, key custody and incident response are in place.

## Supported versions

| Version | Status | Security fixes |
| --- | --- | --- |
| Spec v1 / SDK 0.1.x | Draft | Yes — best effort until ratification |
| Pre-v1 drafts | Superseded | No |

## Reporting a vulnerability

Email **Addy@proficienth.com** with:

- affected artifact: spec, `spec/test-vectors/`, `packages/hallmark-core`,
  `packages/freeroam`, `packages/barricade`, `examples/provider-demo`, or a Pascaal site,
- version or commit hash,
- reproduction steps or a minimal vector,
- impact you believe is possible.

Please do not open a public issue for an unpatched cryptographic or authorization flaw.
We aim to acknowledge within 72 hours and coordinate disclosure on a 90-day timeline,
adjustable when a fix needs more time or a vendor needs notice.

## In scope

- Cryptographic primitive correctness in the reference implementation and SDK.
- Lineage invariants L1–L13, budget disjointness, replay suppression.
- Revocation freshness and fail-closed defaults.
- Canonical JSON strictness, including duplicate-member rejection.
- Key resolution rules: local `kid` lookup; `jku`, `x5u`, `x5c` forbidden.
- Provider harness behaviour: signed surface policy, replay suppression,
  budget charging and PII redaction in events.
- The in-browser verifier on `hallmark.pascaal.com`.
- `pascaal.com` authentication, plugins and redirects.

## Out of scope

- Findings in third-party dependencies used by your own deployment.
- Social engineering against users or administrators.
- Claims that a Seal prevents copying — it does not.
- Bot-detection evasion — Hallmark does not classify behavior.

## Safe handling notes

- `spec/test-vectors/fixtures/keys.json` contains **published test keys**. Never
  use them anywhere real.
- A root key must be bound by a WebAuthn presence ceremony (spec §7.1.1).
- `kid` is a routing hint, not identity. The JWK thumbprint (`jkt`) is identity.
- The Seal covers the signing input, not the signature. Do not "fix" this.
- Stale revocation data must fail closed in high-risk profiles.

## Production checklist before any real deployment

1. Resolve spec §21.
2. Run `npm test` in `spec/` on the exact commit you deploy.
3. Define key custody, rotation and recovery.
4. Choose a revocation profile and max staleness.
5. Instrument deny reasons (`HLM_` codes) and stale-set alerts.
6. Complete an independent review of the gateway integration.
7. Publish your conformance claim per [`CONFORMANCE.md`](CONFORMANCE.md).
