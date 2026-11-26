import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemo } from '../server.mjs';

test('the demo observes T0, gates T1, and records safe events', async () => {
  const demo = await createDemo({ port: 0 });
  const base = `http://127.0.0.1:${demo.port}`;

  try {
    const status = await fetch(`${base}/api/status`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.hallmark.mode, 'observe');
    assert.equal(statusBody.hallmark.present, false);

    const denied = await fetch(`${base}/api/checkout`, { method: 'POST' });
    assert.equal(denied.status, 401);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.hallmark_error, 'HLM_1005');

    const minted = await fetch(`${base}/api/mint`);
    assert.equal(minted.status, 200);
    const grant = await minted.json();
    assert.equal(grant.passport.split('.').length, 3);
    assert.equal(grant.kid.startsWith('ed25519:'), true);

    const allowed = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Hallmark ${grant.passport}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ item: 'starter-plan' }),
    });
    assert.equal(allowed.status, 200);
    const allowedBody = await allowed.json();
    assert.equal(allowedBody.ok, true);
    assert.equal(allowedBody.hallmark.surface, 'checkout');
    assert.equal(allowedBody.hallmark.capability, 'commerce.checkout.v1');
    // The response is sent before the finish hook charges observed usage, so
    // it reports the pre-charge slice. The audit event carries the post-charge
    // remainder.
    assert.equal(allowedBody.remaining.req, 5);
    assert.equal(allowedBody.remaining.cost, 1_000_000);

    const replay = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { Authorization: `Hallmark ${grant.passport}` },
    });
    assert.equal(replay.status, 401);
    assert.equal((await replay.json()).hallmark_error, 'HLM_2004');

    const audit = await fetch(`${base}/api/audit`);
    const { events } = await audit.json();
    const names = events.map((event) => event.event);
    assert.ok(names.includes('passport.absent'));
    assert.ok(names.includes('passport.rejected'));
    assert.ok(names.includes('passport.accepted'));
    assert.ok(names.includes('budget.charged'));
    const charged = events.find((event) => event.event === 'budget.charged');
    assert.equal(charged.remaining.req, 4);
    assert.equal(charged.remaining.cost, 750_000);
    assert.ok(!JSON.stringify(events).includes('usr_demo_4471'));
  } finally {
    await demo.close();
  }
});
