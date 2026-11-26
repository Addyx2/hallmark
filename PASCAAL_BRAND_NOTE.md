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

## Domains + hosting
- `pascaal.com`: **registered** and live — company marketing site, hosted on another platform (not Vercel).
- `hallmark.pascaal.com`: **live** — serves the site in `landing/`, and is the canonical Hallmark / protocol entry point (GitHub About points here).
- `hallmark-topaz.vercel.app`: original Vercel deployment, no longer the canonical URL.
- USPTO: search "Pascaal" (word mark) across classes relevant to identity/auth/SaaS. Distinctive string reduces conflict risk vs. common words.
- Global: UKIPO/WIPO later if going international.

## Messaging note
The company line in this repo is **"AI components for safety and adoption."**
The current `pascaal.com` homepage uses **"Knowledge work, done for you."**
Keep the former as the canonical line for the protocol/docs; align the marketing
site when you next edit it.

## Next practical steps
1. Run the USPTO TM search for "Pascaal" (word mark) in classes 9/38/42 before heavy branding
2. Align the `pascaal.com` hero copy with the company line above, if you want one voice
3. Create logo/brand (minimal)
4. On the public sites, use product name Pascaal, keep "Hallmark protocol" in About/Docs
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
- 2026-11-23: `pascaal.com` registered and live on another platform (company marketing site). `hallmark.pascaal.com` is live serving `landing/`; GitHub About and repo docs repointed there. Vercel URL kept only as a legacy preview.
- 2026-11-25: `pascaal.com` marketing homepage upgraded: hero "AI components for safety and adoption.", Hallmark-only lede, both Hallmark links repointed to `hallmark.pascaal.com`, old blog links removed, Philosophy section and final CTA untouched, skip link/focus styles/mobile Hallmark nav/canvas pause shipped.
- 2026-11-25: Rank Math live head verified (title, description, canonical, OG/Twitter, robots, JSON-LD); global OG thumbnail and site icon live; sitemaps and robots.txt verified. Redirection 301 `/2026/11/22/introducing-hallmark/` → `https://hallmark.pascaal.com/` verified; old post set to draft.
- 2026-11-25: Privacy Policy (`/privacy-policy/`) and Terms of Use (`/terms-of-use/`) published and linked from homepage footer. Fresh homepage content backup saved.
- 2026-11-25: Three spec-theme posts published: "The attribution constraint", "Authority narrows. It does not spill.", and "A kill switch is a containment window". All link to `hallmark.pascaal.com`.
- 2026-11-25: Wordfence hardening: 2FA enabled and required for administrators; XML-RPC authentication disabled. Free license registration and 2FA enrollment remain user actions.
- 2026-11-25: Design merged around the Hallmark editorial rail as the master system: white/blue Geist + Geist Mono, numbered mono eyebrows, hairline rules, restrained accent. `pascaal.com` now carries a "From Pascaal" product strip in that language; `hallmark.pascaal.com` is Hallmark-led and links back to the company site. Philosophy copy and the final "Get your hours back." CTA left untouched.
- 2026-11-26: Mirrored the Hallmark brand mark (blue rounded square with the white corner glyph) into the `pascaal.com` header wordmark. Philosophy and final CTA still untouched; homepage backup refreshed.
- TODO: Cal.com booking URL from user; 5 homepage `mailto:` CTAs remain until supplied. Mailchimp signup deferred by user.
- TODO: User to complete Wordfence free license registration, enroll in 2FA, and revoke the exposed WordPress Application Password.
- TODO: USPTO word-mark search for "Pascaal" (Classes 9/38/42) before heavy branding.
- TODO: Align the `pascaal.com` hero with "AI components for safety and adoption" if a single company voice is wanted.
