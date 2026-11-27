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
});

test('Hallmark title is exact', async () => {
  const html = await read('index.html');
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.ok(html.includes(`<h1 class="statement" data-reveal="load" style="--d:120ms">${title}</h1>`));
});

test('agent-readable files use the exact title and plain framing', async () => {
  const files = ['llms.txt', 'llms-full.txt', 'agent/index.html'];
  for (const file of files) {
    const text = await read(file);
    assert.ok(text.includes(title), `${file} does not use the exact title`);
    assert.doesNotMatch(text, /Autonomy provenance|spec v1|38 vectors|46 checks/i, `${file} still uses the old framing`);
    assert.match(text, /Freeroam observes cooperative agent traffic, flags anomalies, and never denies/i, `${file} does not frame Freeroam correctly`);
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
