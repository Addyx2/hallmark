import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const title = 'Hallmark provides a clean trail of use and ownership through tracable passports , resolving agents acts to authorised parties.';

async function read(relative) {
  return readFile(new URL(relative, root), 'utf8');
}

function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160);/g, ' ')
    .replace(/\s+/g, ' ');
}

test('Hallmark page is Hallmark-only', async () => {
  const files = ['index.html', 'llms.txt', 'llms-full.txt', 'agent/index.html'];
  for (const file of files) {
    const html = await read(file);
    assert.doesNotMatch(html, /\b(Plots|Waterguard)\b/, `${file} still names another product`);
  }
});

test('Hallmark page has responsive structure', async () => {
  const html = await read('index.html');
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(html, /@media\(max-width:1000px\)/);
  assert.match(html, /@media\(max-width:560px\)/);
  assert.match(html, /@media\(max-width:760px\)/);
  assert.match(html, /section\{scroll-margin-top:96px\}/);
  assert.match(html, /section\{scroll-margin-top:132px\}/);
});

test('Hallmark title is exact across human and social surfaces', async () => {
  const html = await read('index.html');
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.trim();
  assert.equal(h1, title);
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.ok(html.includes(`<meta property="og:title" content="${title}">`));
  assert.ok(html.includes(`<meta name="twitter:title" content="${title}">`));
});

test('agent-readable files use the exact title and plain framing', async () => {
  const files = ['llms.txt', 'llms-full.txt', 'agent/index.html'];
  for (const file of files) {
    const text = await read(file);
    assert.ok(text.includes(title), `${file} does not use the exact title`);
    assert.doesNotMatch(text, /Autonomy provenance|spec v1|38 vectors|46 checks/i, `${file} still uses the old framing`);
    assert.match(text, /Freeroam observes cooperative agent traffic, flags anomalies, and never denies/i, `${file} does not frame Freeroam correctly`);
    assert.doesNotMatch(text, /Every agent action resolves/i, `${file} overclaims attribution`);
    assert.match(text, /never at first contact/i, `${file} does not constrain Barricade to a responsible action`);
    assert.match(text, /Authority narrows\. It does not spill\./, `${file} uses a stale essay title`);
    assert.match(text, /A kill switch is a containment window/, `${file} uses a stale essay title`);
  }
});

test('Hallmark page avoids generated-looking numbering and proof badges', async () => {
  const html = await read('index.html');
  const body = html.slice(html.indexOf('<body>'));

  assert.doesNotMatch(visibleText(body), /(?<!\d)0[1-9](?!\d)/);
  assert.doesNotMatch(body, /class="(?:n|idx)"/);
  assert.doesNotMatch(body, /(?:Spec v1|spec v1|38 vectors|46 checks|One component|One thesis)/i);
  assert.doesNotMatch(body, /class="proof-chip"/);
  assert.doesNotMatch(body, /id="numbers"/);
});

test('verifier compares the tampered input to the presented seal', async () => {
  const html = await read('index.html');
  assert.match(html, /const presentedSeal = originalSeal;/);
  assert.match(html, /const sealOk = \(await sealOf\(input\)\) === presentedSeal;/);
  assert.match(html, /PASS · root attestation intact/);
  assert.match(html, /FAIL · signature and seal mismatch/);
  assert.doesNotMatch(html, /V2 seal mismatch/);
  assert.match(visibleText(html), /signs a sample root attestation/i);
});

test('status, metadata, robots and sitemap are present', async () => {
  const html = await read('index.html');
  assert.match(html, /Open draft · executable · not ratified/);
  assert.match(html, /"softwareVersion":"v1-draft"/);
  assert.match(html, /"name":"status"/);
  const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.ok(jsonLd['@graph'].some((node) => node['@type'] === 'SoftwareApplication' && node.softwareVersion === 'v1-draft'));
  assert.match(html, /<link rel="alternate" type="text\/plain" href="\/llms-full\.txt"/);

  const robots = await read('robots.txt');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Sitemap: https:\/\/hallmark\.pascaal\.com\/sitemap\.xml/);

  const sitemap = await read('sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/hallmark\.pascaal\.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/hallmark\.pascaal\.com\/agent\/<\/loc>/);
});

test('public copy avoids overclaims and keeps product framing precise', async () => {
  const html = await read('index.html');
  const body = visibleText(html.slice(html.indexOf('<body>')));

  assert.doesNotMatch(body, /verification is stateless/i);
  assert.doesNotMatch(body, /carries no PII/i);
  assert.doesNotMatch(body, /every agent action/i);
  assert.doesNotMatch(body, /ChatGPT|Claude|Cursor|LangGraph|OpenAI Agents SDK/);
  assert.match(body, /locally pinned keys and revocation data/i);
  assert.match(body, /not identity documents/i);
  assert.match(body, /no URL-based key discovery/i);
  assert.match(body, /never at first contact/i);
  assert.match(body, /lower-risk routes may degrade only with an alert/i);
  assert.match(body, /Integration points/);
  assert.match(body, /Authority narrows\. It does not spill\./);
  assert.match(body, /A kill switch is a containment window/);
  assert.doesNotMatch(body, /Grants narrow authority|The containment window\b/);
});

test('accessibility and clipboard affordances are implemented', async () => {
  const html = await read('index.html');
  assert.match(html, /<a class="skip-link" href="#top">Skip to content<\/a>/);
  assert.match(html, /<main class="col" id="top" tabindex="-1">/);
  assert.match(html, /aria-current="location"/);
  assert.doesNotMatch(html, /toggleAttribute\('aria-current'/);
  assert.doesNotMatch(html, /<h4>/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /animation-duration:\.01ms!important/);
  assert.match(html, /min-height:38px/);
  assert.match(html, /<\/button>\s*<span class="sr-only" role="status" aria-live="polite" id="promptStatus">/);
  assert.match(html, /Clipboard permission was blocked/);
  assert.match(html, /window\.prompt\('Copy this setup prompt:'/);
});

test('dead navigation and status CSS are removed', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /nav-parent|foot-status/);
});

test('social card is the canonical Open Graph size', async () => {
  const png = await readFile(new URL('og.png', root));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
