import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relative) {
  return readFile(new URL(relative, root), 'utf8');
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

  // The hero chips and the stats grid must not share the .proof class.
  assert.equal((html.match(/\.proof\{display:/g) || []).length, 1);
  assert.match(html, /class="proof-chip"/);
});

test('Hallmark title and body claims stay intact', async () => {
  const html = await read('index.html');
  assert.match(html, /Autonomy Provenance <b>for Compliance and Safety\.<\/b>/);
  assert.match(html, /signed, short-lived passport that\s+resolves every agent action to the human who authorized it/);
  assert.match(html, /Hallmark spec v1 &mdash; draft/);
});
