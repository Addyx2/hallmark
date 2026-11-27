# Hallmark product definition

**Status: working definition for the next build cycle.** Not a promise of dates.
The normative protocol is [`spec/Hallmark-Agent-Identity-Spec.md`](spec/Hallmark-Agent-Identity-Spec.md).
Where prose and code disagree, prose wins and the implementation is a bug.

## One sentence

Hallmark lets a platform answer, in milliseconds and with a receipt: **which paying human is responsible for this agent action, and was this exact action authorized?**

## Who buys it

Not the end user first. The first buyer is **platform engineering / trust & safety at a SaaS that already sees agent traffic** — agents hold sessions, burn API spend, write to workspaces, and move money, but the platform cannot attribute the action to a human.

The user leash is the long-term switching cost. The provider gate is the wedge.

## The problem

- Blocking agents loses usage and looks obsolete.
- Accepting agents blind loses attribution and creates liability.
- Re-authenticating every action destroys the reason to use agents.

Hallmark replaces re-authentication with a cheap computation: verify lineage, check capability, bind budget, pin action and lifetime, then emit a receipt.

## The wedge

Follow the design note in [`spec/design/Product-Family.md`](spec/design/Product-Family.md):

1. **Freeroam** — observe-only attribution. Cooperative agents self-identify. No accounts, no interception. Value on day one.
2. **Barricade** — enforce at the first *responsible* action: purchase, content-use license, destructive operation. **Wall the first responsibility, never first contact.**
3. **Trackline** — the human-readable receipt that makes the enforcement legible.

Tiers:

| Tier | Moment | What happens |
| --- | --- | --- |
| T0 | First contact | Guest imprint-lite, read-only, zero spend |
| T1 | First responsible action | One tap: OIDC + WebAuthn presence → root attestation → grant → proceed |
| T2 | High-value / policy-gated | Liveness or passkey re-assertion on demand |

## MVP definition

A developer can do this in 15 minutes:

```bash
npm install @pascaal/hallmark
npm install @pascaal/barricade
```

Then:

- `verifyPassport()` and primitives ship with types.
- A `hallmark+barricade-policy` file declares surfaces × gates × tiers.
- Node middleware checks Imprint, checks Grant for the exact action, denies with pinned `HLM_` codes, and emits a Trackline receipt.
- A demo provider blocks a purchase until a Hallmark grant is presented.
- A hosted endpoint supplies key resolution, registry anchors and revocation freshness.

If that works, Hallmark is a product. If it only reads well, it is still a spec.

The Phase 2 harness delivers this locally with Express-compatible middleware,
Fastify hooks, a pure evaluator for Next.js App Router, TypeScript declarations,
and a runnable demo. The demo now includes a local control-room dashboard — a
preview of the Leash + Trackline surface — showing grants, budgets, revocation
state and safe receipts with revoke and kill-lineage controls. It is still a
draft: lineage anchoring, attestation resolution, PoP, signed revocation
manifests and a chained audit log are Phase 3+ work. See
[`docs/quickstart.md`](docs/quickstart.md).

## Product surface map

| Layer | Artifact | Status |
| --- | --- | --- |
| Protocol | Spec v1, vectors, crosscheck | Draft v1, executable, not ratified |
| Core SDK | `packages/hallmark-core` | Scaffolded here, not published to npm yet |
| Provider wedge | `packages/freeroam`, `packages/barricade` | Draft harness here; npm publish pending scope claim |
| Console preview | `apps/console/`, `docs/product-architecture.md` | Clickable UI preview with mocked data; no hosted app |
| Managed trust | registry + minting service | Next build |
| User leash | agents, grants, budgets, revoke, kill-switch | Later |
| Trackline | human-readable receipts | Later |
| Seal v2 | ownership of original works | Design note only |

## Non-goals

- Not a bot detector. Hallmark does not claim to distinguish humans from agents by behavior.
- Not DRM. A Seal makes copying detectable and attributable; it cannot prevent copying.
- Not a general identity provider. Hallmark resolves responsibility; it does not replace OIDC.
- Not a ratified standard until spec §21 is closed.
- Not a consumer app before a provider can consume a grant.

## Success metric

One provider integrated in under 15 minutes, with:

- 100% of risky agent actions carrying a resolvable human,
- unknown agents denied on the gated route,
- every allow/deny producing a receipt,
- verification inside the documented latency budget,
- no remote key resolution and no silent fail-open on stale revocation.

## Pricing thesis

- **Free:** Apache-2.0 core, reference vectors, self-hosted verifier.
- **Paid:** managed registry, attestation minting, revocation freshness, receipts, support.
- **Enterprise:** dedicated / air-gapped deployment and conformance program.
- Charge at the moment of responsibility, not at first contact.

## Relationship to the company

Pascaal is the company: **AI components for safety and adoption.**
Hallmark is the first product and the protocol name. Plots and Waterguard inherit the same lineage but do not ship yet.
