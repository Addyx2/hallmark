# Rename to Pascaal (product) while keeping Hallmark (protocol)

## Rationale
- Hallmark is heavily trademarked in US (Hallmark Cards Inc) — risky for a product name. Keep as protocol/spec/internal name.
- Pascaal: domain pascaal.com appears available, distinctive (close to Pascal/Pascale but unique), blank slate, pronounceable. Fits "identity/provenance" brand.
- Product family (Imprint, Grants, Barricade, Freeroam, Trackline, Seal v2) reads clean under Pascaal.

## Naming map
- Product/company: Pascaal
- Protocol/spec: Hallmark (keep filenames/spec titles as-is for now to avoid breaking references; can alias later)
- Repo stays `hallmark` (or rename later if desired) — not critical.

## Suggested tagline
"Pascaal — resolve agent → human. Attribute every action."

## GTM wedge (matches your thesis)
"Accept agents. Attribute humans." — every SaaS can know which user owns the agents using their platform.

## Domain + trademark quick checks (to do before public launch)
- pascaal.com: appears available (based on search context). Buy before others do.
- USPTO: search "Pascaal" (word mark) across classes relevant to identity/auth/SaaS. Distinctive string reduces conflict risk vs. common words.
- Global: UKIPO/WIPO later if going international.

## Landing (private for now)
Keep landing/index.html private as requested. Can publish later at pascaal.com or GitHub Pages if you flip that decision.

## Next practical steps (when ready to ship beyond private)
1. Register pascaal.com (if not yet)
2. Create USPTO TM search for "Pascaal" (word mark) in relevant classes (Class 42/38/9 for SaaS/auth/telecom) before heavy branding
3. Create logo/brand (minimal)
4. When you flip to public landing, use product name Pascaal, keep "Hallmark protocol" in About/Docs
5. Plugin-first GTM (Freeroam → Barricade) as designed

## Answer to "how can people use this now?"
- Today: read spec + design notes, run `npm test` in spec/ (reference impl + vectors). Protocol is concrete.
- Near-term: implement plugin (imprint header + resolve + grant) first — this matches the viral loop (ask at first responsibility). App (Agent/Cluster/Trackline/Notifications) second.
- Distribution: providers install plugin (Freeroam gives value immediately with zero accounts). That’s the wedge.

## Verdict
Pascaal is the right call. Distinctive, available-ish domain-wise, avoids Hallmark Cards' heavy TM footprint, and gives you a clean brand to build multiple products under.

## Status log
- 2026-10-19: User chose Pascaal as product name; landing stays private for now.
- 2026-10-19: DNS check `pascaal.com` — no A/NS records (consistent with unregistered). Register ASAP to lock it in.
- 2026-10-19: Landing page rebranded to Pascaal (Hallmark kept as protocol name in footer + docs).
- TODO: USPTO word-mark search for "Pascaal" (Classes 9/38/42) before public launch.
- TODO: Buy pascaal.com when ready to go public.
