import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createConsole } from '../serve.mjs';

test('console server serves the UI preview and agent-readable surfaces', async () => {
  const app = createConsole({ port: 0 });
  const port = await app.start();
  const base = `http://127.0.0.1:${port}`;

  const surfaces = [
    ['/', /text\/html/, /id="auth-screen"/, /id="app-shell"/, /rel="icon" href="data:image\/svg\+xml/, /aria-pressed="false"/],
    ['/styles.css', /text\/css/, /--blue:/, /\.auth-screen/, /\.toast\.visible/, /tr\.current-plan/],
    ['/app.js', /javascript/, /SCREENS = \{/, /Freeroam seems to very adaptible/, /const ROLE_MODEL = \{/],
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

    for (const [path, type] of [
      ['/', /text\/html/],
      ['/styles.css', /text\/css/],
      ['/app.js', /javascript/],
      ['/llms.txt', /text\/plain/],
    ]) {
      const head = await fetch(`${base}${path}`, { method: 'HEAD' });
      assert.equal(head.status, 200, `HEAD ${path} should return 200`);
      assert.match(head.headers.get('content-type'), type, `HEAD ${path} content type`);
      assert.equal(head.headers.get('cache-control'), 'no-store');
    }
    const headMissing = await fetch(`${base}/nope`, { method: 'HEAD' });
    assert.equal(headMissing.status, 404);

    for (const method of ['GET', 'HEAD']) {
      const favicon = await fetch(`${base}/favicon.ico`, { method });
      assert.equal(favicon.status, 204, `${method} /favicon.ico should not 404`);
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
  const [html, script, styles, llms, full, agent, architecture] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8'),
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

  // Product naming and spec-wide proof labels are consistent.
  for (const [name, text] of [['index.html', html], ['app.js', script], ['llms.txt', llms], ['llms-full.txt', full], ['agent page', agent]]) {
    assert.doesNotMatch(text, /\bPascaal console\b/, `${name} capitalizes Console`);
  }
  for (const [name, text] of [['llms.txt', llms], ['llms-full.txt', full], ['agent page', agent]]) {
    assert.match(text, /spec-wide vectors/, `${name} scopes vector counts to the spec`);
    assert.match(text, /mock cost\s+units \(100 units = \$1\)/, `${name} states mock cost units`);
    assert.match(text, /HLM_6004/, `${name} covers stale revocation`);
  }
  assert.match(llms, /No remote key resolution/);
  assert.match(agent, /No remote key resolution/);
});

test('console preview enforces the role model and creates a real mock org on signup', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
  ]);

  assert.ok(script.includes('const ROLE_BANNER = \'Role model (preview): owner · admin · developer · viewer. Roles are per organization and enforced client-side here; the hosted product enforces them server-side.\';'));
  assert.match(script, /owner: \{ label: 'owner', may: \['members', 'projects', 'keys', 'grants', 'billing'\] \}/);
  assert.match(script, /developer: \{ label: 'developer', may: \['projects', 'keys', 'grants'\] \}/);
  assert.match(script, /viewer: \{ label: 'viewer', may: \[\] \}/);
  assert.match(script, /<strong>Role model\.<\/strong> \$\{ROLE_BANNER\}/);
  for (const ability of ['members', 'projects', 'keys', 'grants']) {
    assert.match(script, new RegExp(`can\\('${ability}'\\)`), `${ability} is gated by role`);
  }
  assert.match(script, /function syncSignedInMember\(email\)/);
  assert.ok(script.includes('state.members.some((m) => m.orgId === o.id && m.email.toLowerCase() === email.toLowerCase())'));
  assert.ok(script.includes('<tr><td class="mono">Signed in as</td><td>${esc(email)}${state.members.some((m) => m.email === email && m.orgId === state.activeOrg) ? \' \' + badge(\'member\', \'ok\') : \'\'}</td></tr>'));

  assert.ok(script.includes("const name = $('auth-org').value.trim() || `${email.split('@')[0]}'s workspace`;"));
  assert.match(script, /createOrgWithStarter\(name, email\)/);
  assert.match(script, /enterConsole\(email, true\)/);
  assert.match(script, /state\.orgs\.push\(\{ id, name, slug, role: 'owner', plan: 'Starter'/);
  assert.match(script, /name: 'Starter project'/);
  assert.match(script, /starter: true/);
  assert.doesNotMatch(script, /state\.orgs\[0\]\.name = name/);
  assert.match(html, /Create account adds a new organization with a\s+starter project/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-pressed="true"/);
});

test('console grant expiry, redaction and budget history match the brief', async () => {
  const script = await readFile(new URL('../app.js', import.meta.url), 'utf8');

  assert.match(script, /const until = \(iso\) => \{/);
  assert.match(script, /const isExpired = \(iso\) => new Date\(iso\)\.getTime\(\) <= Date\.now\(\)/);
  assert.ok(script.includes('if (secs < 60) return `in ${secs}s`;'));
  assert.ok(script.includes('if (secs < 3600) return `in ${Math.floor(secs / 60)}m`;'));
  assert.match(script, /\$\{esc\(until\(g\.expires\)\)\}/);
  assert.match(script, /isExpired\(g\.expires\) \? ' ' \+ badge\('expired', 'warn'\)/);
  assert.doesNotMatch(script, /ago\(g\.expires\)\.replace/);
  assert.ok(script.includes('// Keep the recorded budget total; revocation changes state, not history.'));
  assert.ok(script.includes("// Preserve each grant's last recorded budget while changing its state."));
  assert.doesNotMatch(script, /grant\.remaining = ['"]0 \/ 5 req['"]/);

  assert.ok(script.includes('azp ${mask(e.azp || e.human)} · ln ${mask(e.ln)} · cnf ${mask(e.cnf)} · jti ${e.jti}'));
  assert.match(script, /azp: human,/);
  assert.match(script, /ln: `ln_demo_\$\{String\(i \+ 1\)\.padStart\(4, '0'\)\}`/);
  assert.match(script, /cnf: `jkt_demo_\$\{String\(\(i \* 37\) % 991\)\.padStart\(4, '0'\)\}`/);
  assert.ok(script.includes('each explicitly masked in the receipt stream and revealed together by the'));
  assert.match(script, /disabled title="Export is disabled in this UI preview"/);
  assert.doesNotMatch(script, /const redacted = state\.filters\.redaction/);
});

test('console filters, accessibility and mocked billing contracts are wired', async () => {
  const [html, script, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(script, /function filterControls\(prefix\)/);
  assert.match(script, /function inTimeWindow\(ts, windowKey\)/);
  for (const key of [
    'trafficProject', 'trafficAgent', 'trafficTime', 'trafficSurface', 'trafficAttribution',
    'eventCode', 'eventProject', 'eventAgent', 'eventTime', 'eventSearch',
  ]) {
    assert.ok(script.includes(`state.filters.${key}`), `${key} is filterable`);
  }
  assert.match(script, /filterControls\('traffic'\)/);
  assert.match(script, /filterControls\('event'\)/);

  assert.match(script, /function focusDescriptor\(el\)/);
  assert.match(script, /function restoreFocus\(descriptor\)/);
  assert.match(script, /const focus = focusDescriptor\(document\.activeElement\)/);
  assert.match(script, /restoreFocus\(focus\)/);
  assert.match(script, /setSelectionRange\(descriptor\.start, descriptor\.start\)/);
  assert.match(script, /a\.setAttribute\('aria-current', 'page'\)/);
  assert.ok(html.includes('<div id="toast" class="toast" role="status" aria-live="polite"></div>'));
  assert.doesNotMatch(html, /id="toast"[^>]*\bhidden\b/);
  assert.match(styles, /\.toast\.visible/);
  assert.match(styles, /\.filter-row select:focus, \.filter-row input:focus/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(html, /<span id="user-menu"/);
  assert.doesNotMatch(html, /<button id="user-menu"/);

  assert.match(script, /<table class="sr-only">/);
  assert.match(script, /<caption>\$\{esc\(label\)\} per day \(mocked\)<\/caption>/);
  assert.match(script, /role="img" aria-label="\$\{esc\(label\)\} per day; exact values in the following table"/);
  assert.equal((script.match(/<th\b(?![^>]*\bscope="col")/g) || []).length, 0, 'every console table header has scope="col"');

  assert.ok(script.includes('const COST_UNIT_NOTE = \'Mock cost units: 100 units = $1. No billing is connected.\';'));
  assert.match(script, /const PLANS = \{[\s\S]*Starter:[\s\S]*Growth:[\s\S]*Scale:/);
  assert.match(script, /class="current-plan"/);
  assert.match(styles, /tr\.current-plan/);
  assert.match(script, /Invoices <span class="mono muted">illustrative<\/span>/);
  assert.match(script, /Amount \(cost units\)/);
});
