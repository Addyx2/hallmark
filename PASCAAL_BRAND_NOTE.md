# Pascaal — brand and product decision record

**Status: public decision record.** This note records the naming decision and the
current public surface status. It is not a launch checklist.

## Decision

- **Company: Pascaal** — "AI components for safety and adoption."
- **Product and protocol: Hallmark** — agent identity and accountability:
  passports, grants, Trackline.
- On public sites, use Pascaal as the company name and Hallmark as the product/protocol name.
- Spec titles, filenames and code prefixes keep the `hallmark` name so existing
  references resolve. The repository stays `hallmark`.

## Product map

| Product | Job | Status |
| --- | --- | --- |
| Hallmark | Agent identity and accountability: passports, grants, revocation, receipts | Spec draft v1.0, open/executable; §21 open; not ratified; no production deployment; core SDK 0.1.0 local/unpublished |
| Plots | Plan, execute and report autonomous work | In design |
| Waterguard | Threat model, policy and containment for agents | Research |

Every action carrying a valid Hallmark passport resolves to one responsible
human. Keys are pinned locally; there is no URL/remote key discovery. Hallmark
does not attribute non-cooperating traffic and is not a bot detector.

## Public sites

- `pascaal.com` — **live**: company marketing site, hosted on WordPress outside
  this repository.
- `hallmark.pascaal.com` — **live**: the canonical Hallmark product/protocol site,
  served from `landing/` in this repository.
- `hallmark-topaz.vercel.app` — legacy preview URL, no longer canonical.

## Trademark and accounts

- USPTO: one pending word-mark application for "Pascaal" (Classes 9/38/42); no
  registration is claimed.
- X: Do not link an X account until ownership is verified.

## Near-term sequence

1. Provider plugin first: **Freeroam** (observe-only attribution) → **Barricade**
   (enforcement). Barricade walls the first responsible action, never first
   contact; it enforces only on signed responsible-action surfaces.
2. Hosted console second: a developer console with organizations, roles,
   projects, scoped keys, agents, grants, traffic, receipts, usage and
   agent-readable docs. The `apps/console/` build is a UI preview with mocked
   data, not a hosted app.
3. Managed trust service later: registry anchors, key custody and revocation
   manifests are local fixtures until the Phase 3 service exists.
