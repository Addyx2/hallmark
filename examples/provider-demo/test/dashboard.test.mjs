import test from 'node:test';
import assert from 'node:assert/strict';

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

    for (const [path, pattern] of [
      ['/dashboard/styles.css', /text\/css/],
      ['/dashboard/app.js', /javascript/],
    ]) {
      const asset = await fetch(`${base}${path}`);
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get('content-type'), pattern);
    }

    const help = await fetch(`${base}/api/help`);
    assert.equal(help.status, 200);
    assert.match(await help.text(), /Dashboard  \/dashboard/);
  } finally {
    await demo.close();
  }
});

test('dashboard controls revoke, kill and reset live demo state', async () => {
  const demo = await createDemo({ port: 0 });
  const base = `http://127.0.0.1:${demo.port}`;

  try {
    const minted = await fetch(`${base}/api/mint`);
    const grant = await minted.json();
    assert.equal(typeof grant.passport, 'string');
    assert.equal(typeof grant.session, 'string');

    const before = await (await fetch(`${base}/api/dashboard`)).json();
    assert.equal(before.mode, 'local-demo');
    assert.equal(before.grants.length, 1);
    assert.equal(before.grants[0].session, grant.session);
    assert.equal(before.counters.minted, 1);

    const revoke = await fetch(`${base}/api/dashboard/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'session', id: grant.session }),
    });
    assert.equal(revoke.status, 200);
    const revokedSnapshot = (await revoke.json()).snapshot;
    assert.ok(revokedSnapshot.revocation.sessions.includes(grant.session));
    assert.equal(revokedSnapshot.grants[0].revoked, true);
    assert.equal(revokedSnapshot.audit[0].event, 'grant.revoked');

    const denied = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { Authorization: `Hallmark ${grant.passport}` },
    });
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
    assert.equal(killed.audit[0].event, 'lineage.killed');

    const reset = await fetch(`${base}/api/dashboard/reset`, { method: 'POST' });
    const fresh = (await reset.json()).snapshot;
    assert.equal(fresh.grants.length, 0);
    assert.equal(fresh.counters.minted, 0);
    assert.deepEqual(fresh.revocation.sessions, []);
    assert.deepEqual(fresh.revocation.attestations, []);
    assert.equal(fresh.audit.length, 1);
    assert.equal(fresh.audit[0].event, 'demo.reset');
  } finally {
    await demo.close();
  }
});
