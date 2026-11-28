import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemo } from '../server.mjs';

async function postMint(base) {
  const response = await fetch(`${base}/api/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function postClock(base, body) {
  return fetch(`${base}/api/dashboard/clock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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

    const grant = await postMint(base);
    assert.equal(grant.passport.split('.').length, 3);
    assert.equal(grant.kid.startsWith('ed25519:'), true);

    // GET remains an intentional, documented local shortcut; POST is primary.
    const shortcut = await fetch(`${base}/api/mint`);
    assert.equal(shortcut.status, 200);
    const shortcutGrant = await shortcut.json();
    assert.equal(shortcutGrant.passport.split('.').length, 3);

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

test('stale revocation fails closed with HLM_6004 and resume restores a usable grant', async () => {
  const demo = await createDemo({ port: 0 });
  const base = `http://127.0.0.1:${demo.port}`;

  try {
    const grant = await postMint(base);
    const checkout = () => fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { Authorization: `Hallmark ${grant.passport}` },
    });

    const before = (await (await fetch(`${base}/api/dashboard`)).json()).revocation;
    assert.equal(before.frozen, false);
    assert.equal(before.clockOffsetSec, 0);
    assert.ok(before.ageSec <= before.maxStalenessSec);

    const freeze = await postClock(base, { action: 'freeze' });
    assert.equal(freeze.status, 200);
    const frozen = (await freeze.json()).snapshot;
    assert.equal(frozen.revocation.frozen, true);
    assert.equal(frozen.revocation.clockOffsetSec, 0);
    assert.equal(frozen.audit[0].event, 'revocation.frozen');

    const advance = await postClock(base, { action: 'advance', seconds: 60 });
    assert.equal(advance.status, 200);
    const stale = (await advance.json()).snapshot;
    assert.equal(stale.revocation.clockOffsetSec, 60);
    assert.equal(stale.revocation.frozen, true);
    assert.ok(stale.revocation.ageSec > stale.revocation.maxStalenessSec);
    assert.equal(stale.audit[0].event, 'clock.advanced');

    const denied = await checkout();
    assert.equal(denied.status, 503, 'HLM_6004 is a fail-closed 503, not a 401');
    const deniedBody = await denied.json();
    assert.equal(deniedBody.error, 'revocation_set_stale');
    assert.equal(deniedBody.hallmark_error, 'HLM_6004');
    assert.match(deniedBody.detail, /manifest age \d+s > \d+s/);

    const afterDeny = (await (await fetch(`${base}/api/dashboard`)).json());
    assert.equal(afterDeny.counters.denied, 1);
    assert.equal(afterDeny.counters.accepted, 0);
    assert.equal(afterDeny.counters.charged, 0);
    assert.equal(afterDeny.grants[0].status, 'minted', 'a stale denial does not consume the grant');
    assert.equal(afterDeny.audit[0].code, 'HLM_6004');
    assert.equal(afterDeny.audit[0].gate, 'grant');

    const invalid = await postClock(base, { action: 'rewind' });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, 'invalid_clock_action');

    const resume = await postClock(base, { action: 'resume' });
    assert.equal(resume.status, 200);
    const resumed = (await resume.json()).snapshot;
    assert.equal(resumed.revocation.frozen, false);
    assert.equal(resumed.revocation.clockOffsetSec, 0);
    assert.ok(resumed.revocation.ageSec <= resumed.revocation.maxStalenessSec);
    assert.equal(resumed.audit[0].event, 'clock.resumed');

    // The same passport is still usable: revocation freshness is independent of
    // replay suppression, and the stale denial did not admit the jti.
    const allowed = await checkout();
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).ok, true);
    const done = (await (await fetch(`${base}/api/dashboard`)).json());
    assert.equal(done.counters.accepted, 1);
    assert.equal(done.grants[0].status, 'used');
  } finally {
    await demo.close();
  }
});

test('demo counters stay monotonic outside the bounded audit ring', async () => {
  const demo = await createDemo({ port: 0 });
  const base = `http://127.0.0.1:${demo.port}`;

  try {
    await fetch(`${base}/api/status`);
    const absent = await fetch(`${base}/api/checkout`, { method: 'POST' });
    assert.equal(absent.status, 401);

    const initial = (await (await fetch(`${base}/api/dashboard`)).json());
    assert.equal(initial.counters.observed, 1);
    assert.equal(initial.counters.denied, 1);
    assert.equal(initial.audit.length, 2);

    // Control events fill the 200-event ring buffer without counting as traffic.
    for (let i = 0; i < 210; i += 1) demo.controlEvent('noop.saturation', { i });
    const saturated = (await (await fetch(`${base}/api/dashboard`)).json());
    assert.equal(saturated.audit.length, 200);
    assert.deepEqual(saturated.counters, initial.counters);

    await fetch(`${base}/api/status`);
    const deniedAgain = await fetch(`${base}/api/checkout`, { method: 'POST' });
    assert.equal(deniedAgain.status, 401);
    const after = (await (await fetch(`${base}/api/dashboard`)).json());
    assert.equal(after.audit.length, 200);
    assert.equal(after.counters.observed, 2);
    assert.equal(after.counters.denied, 2);

    const reset = (await (await fetch(`${base}/api/dashboard/reset`, { method: 'POST' })).json()).snapshot;
    assert.deepEqual(reset.counters, { minted: 0, observed: 0, accepted: 0, denied: 0, charged: 0 });
    assert.equal(reset.audit.length, 1);
    assert.equal(reset.audit[0].event, 'demo.reset');
  } finally {
    await demo.close();
  }
});

test('demo serves HEAD probes, the favicon and the documented API help', async () => {
  const demo = await createDemo({ port: 0 });
  const base = `http://127.0.0.1:${demo.port}`;

  try {
    for (const [path, type] of [
      ['/dashboard', /text\/html/],
      ['/dashboard/styles.css', /text\/css/],
      ['/dashboard/app.js', /javascript/],
      ['/api/help', /text\/plain/],
      ['/api/dashboard', /json/],
    ]) {
      const head = await fetch(`${base}${path}`, { method: 'HEAD' });
      assert.equal(head.status, 200, `HEAD ${path} should return 200`);
      assert.match(head.headers.get('content-type'), type, `HEAD ${path} content type`);
      assert.equal(head.headers.get('cache-control'), 'no-store');
    }
    const rootHead = await fetch(base, { method: 'HEAD', redirect: 'manual' });
    assert.equal(rootHead.status, 302);
    assert.equal(rootHead.headers.get('location'), '/dashboard');

    for (const method of ['GET', 'HEAD']) {
      const favicon = await fetch(`${base}/favicon.ico`, { method });
      assert.equal(favicon.status, 204, `${method} /favicon.ico should not 404`);
    }
    const headMissing = await fetch(`${base}/nope`, { method: 'HEAD' });
    assert.equal(headMissing.status, 404);

    const help = await (await fetch(`${base}/api/help`)).text();
    assert.match(help, /POST \/api\/mint/);
    assert.match(help, /GET \/api\/mint is an intentional local preview shortcut/);
    assert.match(help, /POST \/api\/dashboard\/clock/);
    assert.match(help, /freeze \+ advance 60s => HLM_6004/);
    assert.match(help, /mock cost units \(100 units = \$1\)/);
    assert.match(help, /Crypto vectors are spec-wide/);
    assert.match(help, /Not ratified/);
  } finally {
    await demo.close();
  }
});
