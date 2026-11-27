# Changelog

All notable changes to Pascaal's Hallmark work are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are **SDK** versions. The protocol remains **draft v1** and is not ratified.

## [Unreleased]

### Added

- `packages/freeroam`: observe-only attribution middleware. Reads
  `Authorization: Hallmark <jws>` and `X-Hallmark-*` headers, verifies JWS and
  basic passport claims with local pinned keys, and emits PII-redacted events.
  Never denies a request.
- `packages/barricade`: enforcement middleware. Adds a signed
  `hallmark+barricade-policy` (surfaces × gates × tiers), pinned `HLM_` denials,
  replay suppression, fail-closed revocation freshness, capability/path/profile
  authorization, and an in-memory budget ledger charged from observed usage.
- Fastify hooks and a pure evaluator for Next.js App Router in both packages;
  Express-compatible `(req, res, next)` is the primary target.
- TypeScript declarations for `@pascaal/hallmark`, `@pascaal/freeroam` and
  `@pascaal/barricade`.
- `examples/provider-demo`: runnable Node server proving T0 observation, T1
  grant enforcement, replay rejection and safe audit events.
- Local control-room dashboard at `/dashboard`: agent, grant, budget, revocation
  and safe audit views with mint, checkout, revoke, kill-lineage and reset
  controls. A preview of Leash + Trackline, not the hosted product.
- `docs/quickstart.md`: provider setup, framework snippets, explicit verification
  scope and conformance wording.
- `docs/product-architecture.md`: Supermemory-like target architecture for the
  hosted console — identity model, org scoping, scoped keys, service boundaries
  and security boundaries.
- `apps/console/`: clickable console UI preview with simulated signup/login,
  organizations and roles, projects and scoped API keys, agents and grants,
  Freeroam traffic intelligence, Trackline receipts, usage/billing, docs for
  agents and settings. Mocked data only: no real auth, keys or billing.
- Agent-readable console surfaces: `/llms.txt`, `/llms-full.txt`, `/agent/` with
  JSON-LD, preserving the exact Freeroam framing and all product boundaries.
- Root npm workspaces and `package-lock.json` for local package linking, now
  including `apps/*`.

### Planned

- `docs/openapi.json` for the managed service — deliberately not invented yet.
- Spec §21 resolution before calling v1 ratified.

## [0.1.0] - 2026-11-26

### Added

- `packages/hallmark-core`: installable, zero-dependency package containing the
  v1 primitives — base64url, restricted JCS, Seal, JWK thumbprints, JWS
  sign/parse/verify with the closed `EdDSA`/`ES256` allowlist, strict JSON
  parsing, `HallmarkError`, revocation freshness, replay suppression and budget
  allocation.
- `packages/hallmark-core/src/cli.js`: `hallmark self-test` and
  `hallmark verify <jws> --key <jwk.json> [--typ <type>]`.
- `packages/hallmark-core/test/core.test.mjs`: smoke test for sign → verify,
  Seal sensitivity, canonical JSON rejection and error mapping.
- `PRODUCT.md`, `ROADMAP.md`, `CONFORMANCE.md`, `SECURITY.md`.
- `LICENSE`: Apache-2.0. Chosen deliberately: a patent grant matters for an
  identity/security protocol.

### Changed

- Repository now has an explicit license and product definition.

### Notes

- `packages/hallmark-core` is **not published to npm yet**. The `@pascaal` scope
  must be claimed first.
- `packages/hallmark-core/src/index.js` is a semantic copy of
  `spec/test-vectors/hallmark-ref.mjs`. Only the header comment changed.
- Full conformance still lives in `spec/` (`npm test`: 38 vectors, 46 checks,
  4 properties, 4 enforcement points, spec/code crosscheck).
