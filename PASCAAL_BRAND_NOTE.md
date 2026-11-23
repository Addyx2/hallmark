# Pascaal — company, product map and launch note

## Rationale
- Hallmark is heavily trademarked in US (Hallmark Cards Inc) — risky as a company name, fine as a protocol name.
- Pascaal: domain pascaal.com appears available, distinctive (close to Pascal/Pascale but unique), blank slate, pronounceable. Fits "AI components" brand.
- The company needs room for multiple products: Hallmark today, Plots and Waterguard next.

## Naming map
- **Company: Pascaal** — "AI components for safety and adoption."
- **Product 01: Hallmark** — agent identity and accountability (passport, grants, Trackline). Also the protocol name.
- **Product 02: Plots** — autonomous work management. In design.
- **Product 03: Waterguard** — agent security models. Research.
- Protocol/spec: Hallmark (keep filenames/spec titles as-is to avoid breaking references; can alias later).
- Repo stays `hallmark` (or rename later if desired) — not critical.

## Suggested tagline
"Pascaal — AI components for safety and adoption."

Sub-line: "Hallmark makes agents accountable. Plots puts them to work. Waterguard keeps them inside the lines."

## Product map

| Product | Job | Status |
| --- | --- | --- |
| Hallmark | Resolve agent → human; grants, budgets, receipts | Spec v1, open |
| Plots | Plan, execute and report autonomous work | In design |
| Waterguard | Threat model, policy and containment for agents | Research |

## GTM wedge (matches your thesis)
"Accept agents. Attribute humans." — every SaaS can know which user owns the agents using their platform.

## Domain + trademark quick checks (to do before public launch)
- pascaal.com: appears available (based on search context). Buy before others do.
- USPTO: search "Pascaal" (word mark) across classes relevant to identity/auth/SaaS. Distinctive string reduces conflict risk vs. common words.
- Global: UKIPO/WIPO later if going international.

## Landing (public since 2026-11-23)
`landing/index.html` is in the public repo and is deployed at
`hallmark-topaz.vercel.app` (linked from the repo About). Custom domain
`pascaal.com` is not registered yet — move the Vercel deployment there when it is.

## Next practical steps
1. Register pascaal.com (if not yet) and attach it to the Vercel deployment
2. Create USPTO TM search for "Pascaal" (word mark) in relevant classes (Class 42/38/9 for SaaS/auth/telecom) before heavy branding
3. Create logo/brand (minimal)
4. On the public landing, use product name Pascaal, keep "Hallmark protocol" in About/Docs
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
- 2026-11-17: Structure changed to company-level. Pascaal is the homepage; Hallmark, Plots and Waterguard are products. Company line: "AI components for safety and adoption." Landing rebuilt around that IA.
- 2026-11-23: Repository flipped from private to public (`gh repo edit --visibility public`). Vercel deployment at hallmark-topaz.vercel.app was already live and serving the current landing; docs updated to match.
- TODO: USPTO word-mark search for "Pascaal" (Classes 9/38/42) before heavy branding.
- TODO: Buy pascaal.com when ready to go public.
