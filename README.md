# Pascaal

**Pascaal** — resolve agent → human. Attribute every action.

Pascaal is the product family for agent accountability: **Imprints** (every
agent traces to one responsible human), **Grants** (computed authorizations
with budgets), **Barricade** (enforce at the platform), **Freeroam** (observe
with zero friction) and **Trackline** (user receipts). It is built on the open
**Hallmark** Agent Identity Protocol — Ed25519 with ES256 fallback, RFC 8785
JCS, short-lived passes, disjoint budget slices.

> Hallmark is a protocol name, not a product name — see
> [`PASCAAL_BRAND_NOTE.md`](PASCAAL_BRAND_NOTE.md) for the branding decision
> and remaining launch checks (domain, USPTO).

## Layout

| Path | What it is |
| --- | --- |
| [`spec/`](spec/) | Normative spec + executable reference implementation + conformance suite |
| [`spec/design/`](spec/design/) | Non-normative design notes (Seal v2, product family) |
| [`landing/`](landing/) | Landing page (private for now) |
| [`PASCAAL_BRAND_NOTE.md`](PASCAAL_BRAND_NOTE.md) | Naming decision and launch checklist |

## Verify the spec

```bash
cd spec
npm test        # 38 vectors + 4 properties + 4 budgets + spec/code crosscheck
npm run bench   # performance numbers behind spec §17
```

Full detail: [`spec/README.md`](spec/README.md).

## Status

Draft v1.0, not ratified. No production deployment.
