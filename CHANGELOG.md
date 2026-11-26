# Changelog

All notable changes to Pascaal's Hallmark work are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are **SDK** versions. The protocol remains **draft v1** and is not ratified.

## [Unreleased]

### Planned

- `packages/freeroam` and `packages/barricade` provider middleware.
- `examples/provider-demo` — 15-minute gated purchase demo.
- `docs/quickstart.md` and `docs/openapi.json` for the managed service.
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
