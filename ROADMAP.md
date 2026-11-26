# Hallmark roadmap

Working plan, not dated commitments. Each phase has an exit criterion. Update this file when an exit criterion is met.

| Phase | Artifacts | Exit criterion | Status |
| --- | --- | --- | --- |
| 0 · Define the product | `PRODUCT.md`, `LICENSE`, `CHANGELOG.md`, `CONFORMANCE.md`, `SECURITY.md` | Buyer, wedge, MVP and non-goals written down | Done |
| 1 · Package the core | `packages/hallmark-core`, smoke test, CLI, npm dry-run | A clean install can sign and verify a JWS with zero dependencies | Done locally; npm publish pending scope claim |
| 2 · Ship the provider wedge | `packages/freeroam`, `packages/barricade`, `examples/provider-demo`, `docs/quickstart.md` | One Express/Next.js/Fastify app gated in under 15 minutes | Next |
| 3 · Managed trust service | `services/registry`, `services/mint`, `docs/openapi.json`, status/SLA/DPA | Attestation minting and revocation freshness work without self-hosting | Planned |
| 4 · Leash + Trackline | `apps/leash`, `apps/trackline` | A human can add agents, issue/revoke grants, kill a lineage and read receipts | Later |
| 5 · Trust + launch | conformance directory, GitHub releases, blog, §21 resolution | Providers can claim v1-draft conformance against a published commit | Ongoing |

## Phase 1 note

`packages/hallmark-core/src/index.js` is copied from
`spec/test-vectors/hallmark-ref.mjs`. Only the header comment changed. The
cryptographic semantics, error codes and exports are identical. Full conformance
still runs from `spec/`; the package carries a smoke test, not a second source of truth.

Before publishing:

1. Claim the `@pascaal` npm scope.
2. Set `private: false` already done in the package manifest.
3. Run `npm pack --dry-run` and confirm only `src/`, `README.md`, `LICENSE` and `package.json` ship.
4. Publish `0.1.0` as a draft-tag release: `npm publish --tag draft`.
5. Add the published version to `CHANGELOG.md`.

## Phase 2 note

Build Freeroam before Barricade. It delivers attribution with zero accounts and
no interception, which is the adoption wedge in [`PRODUCT.md`](PRODUCT.md).
Barricade then enforces only at the first responsible action.

## Phase 5 note

Do not call Hallmark ratified until spec §21 is closed. Until then every badge
must say **v1-draft conformant**, never certified or ratified.
