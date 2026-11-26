# Pascaal

**AI components for safety and adoption.**

Pascaal builds the pieces that let agents do real work without losing the human
who is responsible for it. Three products, one thesis: agents should be
**identifiable, employable, and defensible**.

- **Company:** [pascaal.com](https://pascaal.com)
- **Hallmark:** [hallmark.pascaal.com](https://hallmark.pascaal.com) — product and protocol home

| Product | What it is | Status |
| --- | --- | --- |
| **Hallmark** | Agent identity and accountability: a short-lived passport resolves every agent to one responsible human, with grants that name the action and budgets that cannot be shared. | Spec v1, open, executable |
| **Plots** | Autonomous work management: agents plan, execute and report real work, with the plan, spend and hand-offs legible to the owner. | In design |
| **Waterguard** | Agent security models: threat models, policy and containment for agents acting on real systems. | Research |

Hallmark is the foundation: Ed25519 with ES256 fallback, RFC 8785 JCS,
short-lived passes, disjoint budget slices. Plots and Waterguard are designed to
inherit the same lineage rather than invent a second identity system.

> Pascaal is the company; Hallmark is a product (and the protocol name). See
> [`PASCAAL_BRAND_NOTE.md`](PASCAAL_BRAND_NOTE.md) for the naming decision and
> the remaining launch check (USPTO).

## Layout

| Path | What it is |
| --- | --- |
| [`spec/`](spec/) | Hallmark normative spec + executable reference implementation + conformance suite |
| [`spec/design/`](spec/design/) | Non-normative design notes (Seal v2, product family) |
| [`landing/`](landing/) | Site source, published at [hallmark.pascaal.com](https://hallmark.pascaal.com) |
| [`landing/llms.txt`](landing/llms.txt) / [`landing/llms-full.txt`](landing/llms-full.txt) | Agent-readable summaries for answer engines |
| [`landing/agent/`](landing/agent/) | Plain HTML agent view of the same facts |
| [`packages/hallmark-core/`](packages/hallmark-core/) | Installable v1 primitives package (`@pascaal/hallmark`, draft, not published yet) |
| [`PRODUCT.md`](PRODUCT.md) | Buyer, wedge, MVP definition, non-goals and success metric |
| [`ROADMAP.md`](ROADMAP.md) | Phases from core package → provider wedge → managed service → leash |
| [`DEPLOY.md`](DEPLOY.md) | GitHub → Vercel → custom-domain publishing steps and local checks |
| [`CONFORMANCE.md`](CONFORMANCE.md) / [`SECURITY.md`](SECURITY.md) / [`CHANGELOG.md`](CHANGELOG.md) | Conformance levels, vulnerability reporting and version history |
| [`LICENSE`](LICENSE) | Apache-2.0, including a patent grant |
| [`PASCAAL_BRAND_NOTE.md`](PASCAAL_BRAND_NOTE.md) | Naming decision, product map and launch checklist |

## Verify Hallmark

```bash
cd spec
npm test        # 38 vectors + 4 properties + 4 budgets + spec/code crosscheck
npm run bench   # performance numbers behind spec §17
```

Full detail: [`spec/README.md`](spec/README.md).

## Build the product

The protocol is the foundation; the product is the path from spec to a provider
integration. [`PRODUCT.md`](PRODUCT.md) defines the buyer and the 15-minute MVP;
[`ROADMAP.md`](ROADMAP.md) tracks the artifacts still to build.

```bash
cd packages/hallmark-core
node --test test/*.test.mjs   # package smoke tests
node src/cli.js self-test     # sign + verify with a fresh Ed25519 key
```

`packages/hallmark-core/src/index.js` is a semantic copy of
`spec/test-vectors/hallmark-ref.mjs`; only the header changed. Full conformance
still runs from `spec/`. The npm package is staged but not published until the
`@pascaal` scope is claimed.

## Publish the site

`landing/` is a static site deployed by Vercel from GitHub `main`, with the
Vercel project Root Directory set to `landing`. Live at
[hallmark.pascaal.com](https://hallmark.pascaal.com); the company site at
[pascaal.com](https://pascaal.com) is WordPress and lives outside this repo.
See [`DEPLOY.md`](DEPLOY.md) for setup, routine deploys and the agent/AEO
surfaces (`llms.txt`, `llms-full.txt`, `/agent/`, JSON-LD, OG card).

## Status

Hallmark: draft v1.0, not ratified, no production deployment.
Plots: in design. Waterguard: research direction only.
