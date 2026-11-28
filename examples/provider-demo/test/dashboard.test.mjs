import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDemo } from '../server.mjs';

test('dashboard serves the local control room and static assets', async () => {
  const demo = await createDemo({ port: 0 });
  const base = `http://127.0.0.1:${demo.port}`;

  try {
    const root = await fetch(base, { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/dashboard');

    const page = await fetch(`${base}/dashboard`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const html = await page.text();
    assert.match(html, /Control the grant\./);
    assert.match(html, /id="btn-mint"/);
    assert.match(html, /Draft product harness/);
    assert.match(html, /rel="icon" href="data:image\/svg\+xml/);
    assert.match(html, /id="btn-replay"/);
    for (const id of ['btn-freeze', 'btn-advance', 'btn-resume', 'clock-status', 'clock-age', 'clock-offset', 'clock-limit']) {
      assert.match(html, new RegExp(`id="${id}"`), `${id} is present in the clock panel`);
    }
    assert.match(html, /Spec vectors<\/span><span>38 \/ 38 spec-wide/);
    assert.match(html, /Spec crypto<\/span><span>Ed25519 · ES256/);
    assert.match(html, /mock cost units \(100 units = \$1\)/);
    assert.match(html, /Crypto proof refers to the spec-wide vector suite/);
    assert.match(html, /href="https:\/\/hallmark\.pascaal\.com"[^>]*>Protocol/);
    assert.equal((html.match(/<th\b(?![^>]*\bscope="col")/g) || []).length, 0, 'every dashboard table header has scope="col"');

    const assets = {};
    for (const [path, pattern] of [
      ['/dashboard/styles.css', /text\/css/],
      ['/dashboard/app.js', /javascript/],
    ]) {
      const asset = await fetch(`${base}${path}`);
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get('content-type'), pattern);
      assets[path] = await asset.text();
    }
    const css = assets['/dashboard/styles.css'];
    const js = assets['/dashboard/app.js'];

    assert.match(js, /function costUnits\(value\)/);
    assert.doesNotMatch(js, /function money\(units\)/);
    assert.ok(js.includes('${costUnits(remaining.cost)}'));
    assert.match(js, /\['expired', 'Expired'\]/);
    assert.ok(js.includes('if (response.ok) state.passportUsed = true;'));
    assert.match(js, /async function replay\(\)/);
    assert.ok(js.includes("await api('/api/dashboard/reset', { method: 'POST' });"));
    assert.ok(js.includes("$('btn-replay').addEventListener('click', replay);"));
    for (const action of ['freeze', 'advance', 'resume']) {
      assert.ok(js.includes(`clockAction('${action}')`), `${action} clock control is wired`);
    }
    assert.ok(js.includes("if (/reset|frozen|advanced|resumed/.test(event.event)) tone = 'neutral';"));
    assert.match(js, /clockOffsetSec \?\? 0/);
    assert.ok(js.includes("'stale · checkout denies HLM_6004'"));

    assert.match(css, /\.badge\.expired/);
    assert.match(css, /\.event\.neutral \.event-name/);
    assert.match(css, /\.topnav \{[^}]*flex-wrap: wrap/);
    assert.doesNotMatch(css, /\.topnav a:nth-child\(3\) \{ display: none/);

    const help = await (await fetch(`${base}/api/help`)).text();
    assert.match(help, /Dashboard  \/dashboard/);
    assert.match(help, /POST \/api\/mint/);

    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    assert.match(readme, /`POST \/api\/mint`/);
    assert.match(readme, /`GET \/api\/mint` is an intentional local-only\s+shortcut/);
    assert.match(readme, /`POST \/api\/dashboard\/clock`/);
    assert.match(readme, /spec-wide vector suite/);
    assert.match(readme, /mock cost units \(100 units = \$1\)/);
    assert.match(readme, /403 HLM_6002 session_revoked/);
    assert.match(readme, /503 HLM_6004 revocation_set_stale/);
  } finally {
    await demo.close();
  }
});

test('dashboard controls revoke, kill and reset live demo state', async () => {
  const demo = await createDemo({ port: 0 });
  const base = `http://127.0.0.1:${demo.port}`;

  try {
    const grant = await fetch(`${base}/api/mint`).then((response) => response.json());
    assert.equal(typeof grant.passport, 'string');
    assert.equal(typeof grant.session, 'string');

    const before = await (await fetch(`${base}/api/dashboard`)).json();
    assert.equal(before.mode, 'local-demo');
    assert.equal(before.grants.length, 1);
    assert.equal(before.grants[0].session, grant.session);
    assert.equal(before.counters.minted, 1);
    const recordedBudget = before.grants[0].remaining;

    const revoke = await fetch(`${base}/api/dashboard/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'session', id: grant.session }),
    });
    assert.equal(revoke.status, 200);
    const revokedSnapshot = (await revoke.json()).snapshot;
    assert.ok(revokedSnapshot.revocation.sessions.includes(grant.session));
    assert.equal(revokedSnapshot.grants[0].revoked, true);
    assert.deepEqual(revokedSnapshot.grants[0].remaining, recordedBudget);
    assert.equal(revokedSnapshot.audit[0].event, 'grant.revoked');

    const denied = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { Authorization: `Hallmark ${grant.passport}` },
    });
    assert.equal(denied.status, 403);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.hallmark_error, 'HLM_6002');
    assert.equal(deniedBody.error, 'session_revoked');

    const kill = await fetch(`${base}/api/dashboard/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kill-lineage' }),
    });
    const killed = (await kill.json()).snapshot;
    assert.equal(killed.imprint.killed, true);
    assert.ok(killed.revocation.attestations.includes('at_demo_0001'));
    assert.deepEqual(killed.grants[0].remaining, recordedBudget);
    assert.equal(killed.audit[0].event, 'lineage.killed');

    const reset = await fetch(`${base}/api/dashboard/reset`, { method: 'POST' });
    const fresh = (await reset.json()).snapshot;
    assert.equal(fresh.grants.length, 0);
    assert.deepEqual(fresh.counters, { minted: 0, observed: 0, accepted: 0, denied: 0, charged: 0 });
    assert.deepEqual(fresh.revocation.sessions, []);
    assert.deepEqual(fresh.revocation.attestations, []);
    assert.equal(fresh.audit.length, 1);
    assert.equal(fresh.audit[0].event, 'demo.reset');
  } finally {
    await demo.close();
  }
});
