# Publishing Hallmark

Hallmark has two public surfaces. They are published differently.

| Surface | URL | Where it lives | How it ships |
| --- | --- | --- | --- |
| Company site | [pascaal.com](https://pascaal.com) | WordPress (outside this repo) | WordPress admin; Rank Math controls SEO metadata |
| Hallmark product / protocol site | [hallmark.pascaal.com](https://hallmark.pascaal.com) | [`landing/`](landing/) in this repo | GitHub `main` → Vercel → custom domain |

The legacy Vercel preview URL `hallmark-topaz.vercel.app` still works, but it is
not canonical. Always link to `https://hallmark.pascaal.com/` and the canonical
tag in `landing/index.html` says so.

## Hallmark site: GitHub → Vercel

### One-time Vercel setup

1. In Vercel, **Add New… → Project** and import `https://github.com/Addyx2/hallmark`.
2. Set **Root Directory** to `landing`. This is the important setting: the site
   entry point is `landing/index.html`, not a file at the repository root.
3. Framework preset: **Other / Static**. Leave **Build Command** empty and
   **Build Output Directory** empty (or `.`). There is no build step.
4. Add the custom domain `hallmark.pascaal.com` in **Settings → Domains**.
   At the registrar for `pascaal.com`, point `hallmark` to Vercel's CNAME
   (`cname.vercel-dns.com`) and wait for DNS to verify.
5. Keep the production branch as `main`. There is deliberately **no
   `vercel.json`** in this repo; Vercel's project settings are the source of
   truth for the root directory and domain.

### Routine publish

```bash
# from the repository root
git status --short
cd spec && npm test && cd ..
git diff -- spec/test-vectors/vectors.json
git add -A
git commit -m "Describe the change"
git push origin main
```

Inspect `git diff -- spec/test-vectors/vectors.json` before staging. On a clean
checkout, expect only the two ES256 signature segments to change (ES256 uses a
random `k`); do not commit unrelated churn. The same `npm test` run includes the
pre-deploy spec/code crosscheck — treat a crosscheck failure as a blocker.

Vercel picks up the push, builds the static files from `landing/`, and promotes
the deployment to `hallmark.pascaal.com`. Verify the live page after the
deployment finishes.

### What is served from `landing/`

| Path | Purpose |
| --- | --- |
| `/` | `index.html` — the Hallmark site, with canonical, OG/Twitter, favicon and JSON-LD |
| `/og.png` | 1200×630 social card referenced by `og:image` and `twitter:image` |
| `/favicon.svg` | Hallmark mark |
| `/llms.txt` | Short agent-readable summary (the `llms.txt` convention) |
| `/llms-full.txt` | Full agent context, vocabulary and canonical citations |
| `/agent/` | Plain HTML agent view — `landing/agent/index.html` becomes `/agent/` because the root directory is `landing` |
| `/robots.txt` | Crawler access rules and sitemap pointer |
| `/sitemap.xml` | Canonical URL inventory for the human and agent views |
| `/spec/…` | Not served here. Spec files are read from GitHub, linked from the site |

If `/agent/` 404s live, the Vercel **Root Directory** is probably set to the
repository root instead of `landing`. If `/og.png` 404s, confirm the PNG was
committed and pushed.

## Local check before publishing

From `landing/`:

```bash
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/` and check:

- `Verify` ends in **PASS · root attestation intact**.
- `Tamper & verify` ends in **FAIL · signature and seal mismatch**.
- `/llms.txt`, `/llms-full.txt`, `/agent/`, `/robots.txt`, `/sitemap.xml` and `/og.png` all return 200.
- No console errors.
- Canonical is `https://hallmark.pascaal.com/`.
- JSON-LD parses and contains `Organization` + `SoftwareApplication`, with `softwareVersion: v1-draft`.

Conformance for the protocol itself stays separate from the website deploy:

```bash
cd spec
npm test        # 38 vectors (6 accept/32 pinned), 4 properties, 4 enforcement points, spec/code crosscheck
npm run bench   # numbers behind spec §17
```

## Agent / AEO surfaces

The site exposes a machine-readable summary, a fuller context file, and canonical
links back to the human site and the normative spec.

- `llms.txt` — short index: what Hallmark is, status, canonical URLs, rules for agents.
- `llms-full.txt` — primitives, vocabulary, worked-example constants, conformance, citations.
- `/agent/` — plain HTML, no scripts, same facts and citations.
- JSON-LD in `index.html` — `Organization`, `SoftwareApplication` and draft status.
- `/robots.txt` and `/sitemap.xml` — crawler rules and canonical URL inventory.
- Open Graph / Twitter cards — shareable title, description and 1200×630 image.

When the spec changes, update `llms.txt`, `llms-full.txt` and `/agent/` in the
same commit. Treat the normative spec as truth; if prose and code disagree, the
reference implementation is a bug.

## Company site (pascaal.com)

`pascaal.com` is WordPress and is not deployed from this repository. Keep its
edits in the WordPress admin, then verify Rank Math title/description/canonical,
OG image, XML sitemap and `robots.txt`. The 301 from
`/2026/11/22/introducing-hallmark/` → `https://hallmark.pascaal.com/` must stay
in place.
