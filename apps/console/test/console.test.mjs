import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createConsole } from '../serve.mjs';

test('console server serves the UI preview and agent-readable surfaces', async () => {
  const app = createConsole({ port: 0 });
  const port = await app.start();
  const base = `http://127.0.0.1:${port}`;

  const surfaces = [
    ['/', /text\/html/, /id="auth-screen"/, /id="app-shell"/],
    ['/styles.css', /text\/css/, /--blue:/, /\.auth-screen/],
    ['/app.js', /javascript/, /SCREENS = \{/, /Freeroam seems to very adaptible/],
    ['/llms.txt', /text\/plain/, /# Pascaal Console/, /Status: UI preview only/],
    ['/llms-full.txt', /text\/plain/, /full product brief/, /UI preview/],
    ['/agent', /text\/html/, /Pascaal Console/, /application\/ld\+json/],
    ['/agent/', /text\/html/, /Freeroam seems to very adaptible/, /suspicous use/],
  ];

  try {
    for (const [path, type, ...markers] of surfaces) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, `${path} should return 200`);
      assert.match(response.headers.get('content-type'), type, `${path} content type`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.text();
      for (const marker of markers) {
        assert.match(body, marker, `${path} should contain ${marker}`);
      }
    }

    const notFound = await fetch(`${base}/nope`);
    assert.equal(notFound.status, 404);
    assert.deepEqual(await notFound.json(), { error: 'not_found', path: '/nope' });

    const rejected = await fetch(`${base}/`, { method: 'POST' });
    assert.equal(rejected.status, 404);
  } finally {
    await app.close();
  }
});

test('console covers the requested product surfaces', async () => {
  const app = createConsole({ port: 0 });
  const port = await app.start();

  try {
    const [html, script, llms, full, agent, architecture] = await Promise.all([
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
      readFile(new URL('../app.js', import.meta.url), 'utf8'),
      readFile(new URL('../llms.txt', import.meta.url), 'utf8'),
      readFile(new URL('../llms-full.txt', import.meta.url), 'utf8'),
      readFile(new URL('../agent/index.html', import.meta.url), 'utf8'),
      readFile(new URL('../../../docs/product-architecture.md', import.meta.url), 'utf8'),
    ]);

    // Signup and login, organizations/roles, projects/keys, agents/grants,
    // traffic, trackline, usage/billing, docs and settings.
    for (const route of [
      'overview', 'organizations', 'projects', 'agents',
      'traffic', 'trackline', 'usage', 'docs', 'settings',
    ]) {
      assert.match(script, new RegExp(`${route}: screen`), `missing ${route} screen`);
      assert.match(html, new RegExp(`data-nav="${route}"`), `missing nav for ${route}`);
    }

    assert.match(html, /tab-signin/);
    assert.match(html, /tab-signup/);
    assert.match(script, /owner.*admin.*developer.*viewer/);
    assert.match(script, /freeroam:observe/);
    assert.match(script, /barricade:enforce/);
    assert.match(script, /grants:mint/);
    assert.match(script, /kill-lineage/);
    assert.match(script, /HLM_6002/);
    assert.match(script, /HLM_6003/);

    // Freeroam framing must be preserved verbatim, with correct boundaries.
    const frame = 'Freeroam seems to very adaptible on clients side as they can now decide to integrate it into any platform and be a vendor. They can easily see when agents use their website and analyse usage and traffic and even curb suspicous use.';
    for (const [name, text] of [['app.js', script], ['llms-full.txt', full], ['agent page', agent]]) {
      assert.ok(text.includes(frame), `${name} must preserve the exact user framing`);
    }
    assert.match(script, /never denies/);
    assert.match(script, /not bot detection/);
    assert.match(full, /never denies/);
    assert.match(agent, /never denies/);
    assert.match(llms, /Do not call Hallmark ratified, certified or a standard until spec §21 closes/);

    // Honest boundaries across every surface.
    for (const [name, text] of [['llms.txt', llms], ['llms-full.txt', full], ['agent page', agent], ['architecture', architecture]]) {
      assert.match(text, /UI preview|preview only|static UI|design architecture/i, `${name} states preview status`);
      assert.match(text, /not ratified/i, `${name} avoids ratification claims`);
    }
    assert.match(llms, /No remote key resolution/);
    assert.match(full, /jku/, 'full brief forbids remote key resolution params');
    assert.match(full, /fail closed/i);
    assert.match(architecture, /organization_id/);
    assert.match(architecture, /docs\/openapi\.json|openapi\.json/);

    // Product status lines stay consistent.
    for (const text of [llms, full, agent]) {
      assert.match(text, /Plots: in design/);
      assert.match(text, /Waterguard: research/);
    }
  } finally {
    await app.close();
  }
});
