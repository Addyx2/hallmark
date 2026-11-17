# Pascaal

**AI components for safety and adoption.**

Pascaal builds the pieces that let agents do real work without losing the human
who is responsible for it. Three products, one thesis: agents should be
**identifiable, employable, and defensible**.

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
> remaining launch checks (domain, USPTO).

## Layout

| Path | What it is |
| --- | --- |
| [`spec/`](spec/) | Hallmark normative spec + executable reference implementation + conformance suite |
| [`spec/design/`](spec/design/) | Non-normative design notes (Seal v2, product family) |
| [`landing/`](landing/) | Company site (private for now) |
| [`PASCAAL_BRAND_NOTE.md`](PASCAAL_BRAND_NOTE.md) | Naming decision, product map and launch checklist |

## Verify Hallmark

```bash
cd spec
npm test        # 38 vectors + 4 properties + 4 budgets + spec/code crosscheck
npm run bench   # performance numbers behind spec §17
```

Full detail: [`spec/README.md`](spec/README.md).

## Status

Hallmark: draft v1.0, not ratified, no production deployment.
Plots: in design. Waterguard: research direction only.
