# Hallmark roadmap

Working plan, not dated commitments. Each phase has an exit criterion. Update this file when an exit criterion is met.

| Phase | Artifacts | Exit criterion | Status |
| --- | --- | --- | --- |
| 0 · Define the product | `PRODUCT.md`, `LICENSE`, `CHANGELOG.md`, `CONFORMANCE.md`, `SECURITY.md` | Buyer, wedge, MVP and non-goals written down | Done |
| 1 · Package the core | `packages/hallmark-core`, smoke test, CLI, npm dry-run | A clean install can sign and verify a JWS with zero dependencies | Done locally; npm publish pending scope claim |
| 2 · Ship the provider wedge | `packages/freeroam`, `packages/barricade`, `examples/provider-demo`, `docs/quickstart.md` | One Express/Next.js/Fastify app gated in under 15 minutes | Done locally; npm publish pending scope claim |
| 3 · Managed trust service | `services/registry`, `services/mint`, `docs/openapi.json`, status/SLA/DPA | Attestation minting and revocation freshness work without self-hosting | Planned |
| 4 · Leash + Trackline | `apps/leash`, `apps/trackline` | A human can add agents, issue/revoke grants, kill a lineage and read receipts | Local preview in demo; hosted app later |
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

Freeroam observes, Barricade enforces, and the demo proves both in one process.
The first integration target is Express-compatible `(req, res, next)`; Fastify
hooks and a pure evaluator for Next.js App Router are included. The wedge is
deliberate: attribution with zero accounts first, enforcement only at the first
responsible action. See [`docs/quickstart.md`](docs/quickstart.md).

This phase is a **draft product harness**, not L2 conformance. Lineage anchoring,
attestation resolution, PoP, signed revocation manifests and a chained audit log
remain outside these packages. Do not call the middleware ratified or
production-ready.

## Console preview note

`apps/console/` is a **UI preview of the hosted console**, built in the
Supermemory-like shape: organizations, roles, projects, scoped API keys, usage
and agent-readable docs. It covers signup/login, organizations and roles,
projects and keys, agents and grants, Freeroam traffic intelligence, Trackline,
usage/billing and docs for agents. It is static and mocked: no real auth,
database, key custody, registry, revocation service or billing. The target
architecture is in [`docs/product-architecture.md`](docs/product-architecture.md).
Building the real console is Phase 3/4 work, gated on the managed trust service.

## Phase 4 preview note

The provider demo now includes a local control-room dashboard at `/dashboard`.
It shows agents, grants, budgets, revocation state, signed surface policy and
safe audit events, with mint, checkout, revoke, kill-lineage and reset controls.
This is a **preview of the Leash + Trackline surface**, not Phase 4 complete: it
has no accounts, no persistence, no hosted registry, no key custody and no
billing. The hosted `apps/leash` and `apps/trackline` product is still later
work, gated on the Phase 3 managed trust service.

## Phase 5 note

Do not call Hallmark ratified until spec §21 is closed. Until then every badge
must say **v1-draft conformant**, never certified or ratified.
