const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');

const state = {
  snapshot: null,
  passport: null,
  passportUsed: false,
  polling: false,
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function money(units) {
  return `$${number.format(Math.max(0, Math.round((units ?? 0) / 100)))}`;
}

function clock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

function setResult(message, kind = '') {
  const node = $('run-result');
  node.textContent = message;
  node.className = `run-result ${kind}`.trim();
}

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function grantBadge(grant) {
  if (grant.revoked) return ['revoked', 'Revoked'];
  if (grant.status === 'used') return ['used', 'Used'];
  return ['minted', 'Minted'];
}

function renderGrants(grants) {
  const body = $('grant-rows');
  if (!grants.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">No grants yet. Mint one above.</td></tr>';
    return;
  }

  body.innerHTML = grants.map((grant) => {
    const [className, label] = grantBadge(grant);
    const remaining = grant.remaining || {};
    return `
      <tr>
        <td><span class="mono">${escapeHtml(grant.jti)}</span><span class="sub">sqn ${escapeHtml(grant.sqn)}</span></td>
        <td class="mono">${escapeHtml(grant.session)}</td>
        <td><span class="badge ${className}">${label}</span></td>
        <td class="mono">${escapeHtml(remaining.req ?? 0)} / 5</td>
        <td class="mono">${money(remaining.cost)}</td>
        <td style="text-align:right">
          <button class="link-button" type="button" data-revoke="${escapeHtml(grant.session)}" ${grant.revoked ? 'disabled' : ''}>Revoke</button>
        </td>
      </tr>`;
  }).join('');
}

function renderAudit(events) {
  const list = $('audit-list');
  if (!events.length) {
    list.innerHTML = '<li class="event"><span class="event-name">No events yet.</span></li>';
    return;
  }

  list.innerHTML = events.slice(0, 16).map((event) => {
    let tone = '';
    if (event.event === 'passport.accepted' || event.event === 'budget.charged') tone = 'accept';
    if (event.code || /revoked|killed|reset/.test(event.event)) tone = 'deny';
    const meta = [
      event.code ? `${event.code}${event.reason ? ` ${event.reason}` : ''}` : '',
      event.surface,
      event.method,
      event.path,
    ].filter(Boolean).join(' · ');
    return `
      <li class="event ${tone}">
        <span class="event-time mono">${clock(event.ts)}</span>
        <span class="event-name">${escapeHtml(event.event)}</span>
        <span class="event-meta mono">${escapeHtml(meta)}</span>
      </li>`;
  }).join('');
}

function renderPolicy(policy) {
  const surface = policy.surface;
  const capability = policy.capabilities[surface.capability] || {};
  const limits = Object.entries(capability.limits || {})
    .map(([key, value]) => `${key}:${number.format(value)}`)
    .join(' · ');

  $('policy-id').textContent = `signed · ${policy.id}`;
  $('policy-surface').textContent = surface.id;
  $('policy-gate').textContent = `${surface.gate} / tier ${surface.tier}`;
  $('policy-cap').textContent = surface.capability;
  $('policy-revocation').textContent = `${surface.revocation} · ≤${surface.maxStalenessSec}s`;
  $('policy-route').textContent = `${surface.methods.join(', ')} ${surface.pathPrefixes.join(', ')}`;
  $('policy-limits').textContent = limits || 'none';
  $('policy-jws').textContent = `policy JWS ${policy.vault}…`;
}

function render() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  const revocation = snapshot.revocation;
  const fresh = revocation.ageSec <= 30 && revocation.expiresAt > Date.now() / 1000;

  $('clock').textContent = `snapshot ${new Date(snapshot.generatedAt).toLocaleTimeString([], { hour12: false })}`;
  $('stat-minted').textContent = snapshot.counters.minted;
  $('stat-observed').textContent = snapshot.counters.observed;
  $('stat-accepted').textContent = snapshot.counters.accepted;
  $('stat-denied').textContent = snapshot.counters.denied;
  const age = $('stat-revocation');
  age.textContent = `${revocation.ageSec}s`;
  age.classList.toggle('small', !fresh);
  $('rail-status').textContent = fresh ? `revocation fresh · v${revocation.version}` : 'revocation stale';
  document.querySelector('.dot').classList.toggle('stale', !fresh);

  $('identity-tenant').textContent = snapshot.tenant;
  $('identity-audience').textContent = snapshot.audience;
  $('identity-agent').textContent = `${snapshot.agent.name} · ${snapshot.agent.spid}`;
  $('identity-agent-key').textContent = `key ${snapshot.agent.key}`;
  $('identity-imprint').textContent = snapshot.imprint.killed
    ? `${snapshot.imprint.id} · killed`
    : snapshot.imprint.id;
  $('identity-human').textContent = `responsible human ${snapshot.imprint.responsibleHuman}`;

  renderGrants(snapshot.grants);
  renderAudit(snapshot.audit);
  renderPolicy(snapshot.policy);

  $('btn-checkout').disabled = !state.passport || state.passportUsed;
  $('btn-copy').disabled = !state.passport;
  $('passport-snippet').textContent = state.passport
    ? `${state.passport.slice(0, 28)}…${state.passport.slice(-12)}`
    : 'No passport in browser memory';
}

async function refresh() {
  if (state.polling) return;
  state.polling = true;
  try {
    state.snapshot = await api('/api/dashboard');
    render();
  } catch (error) {
    setResult(`Could not refresh dashboard: ${error.message}`, 'deny');
  } finally {
    state.polling = false;
  }
}

async function mint() {
  try {
    const grant = await api('/api/mint');
    state.passport = grant.passport;
    state.passportUsed = false;
    setResult(`Minted ${grant.jti} · session ${grant.session}`, 'ok');
    await refresh();
  } catch (error) {
    setResult(`Mint failed: ${error.message}`, 'deny');
  }
}

async function checkout() {
  if (!state.passport) {
    setResult('Mint a grant first.', 'warn');
    return;
  }
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Hallmark ${state.passport}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ item: 'starter-plan' }),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    state.passportUsed = true;
    const code = body.hallmark_error || 'OK';
    setResult(`${response.status} ${code} · ${body.hallmark?.surface || 'no surface'}`, response.ok ? 'ok' : 'deny');
    await refresh();
  } catch (error) {
    setResult(`Checkout failed: ${error.message}`, 'deny');
  }
}

async function copyPassport() {
  if (!state.passport) return;
  try {
    await navigator.clipboard.writeText(state.passport);
    setResult('Passport copied to clipboard.', 'ok');
  } catch {
    setResult('Clipboard unavailable. Use GET /api/mint directly.', 'warn');
  }
}

async function revoke(session) {
  if (!window.confirm(`Revoke session ${session}? The next checkout will be denied.`)) return;
  try {
    await api('/api/dashboard/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'session', id: session }),
    });
    state.passportUsed = false;
    setResult(`Revoked ${session}. Try checkout to see HLM_6002.`, 'warn');
    await refresh();
  } catch (error) {
    setResult(`Revoke failed: ${error.message}`, 'deny');
  }
}

async function killLineage() {
  if (!window.confirm('Kill the root imprint and every grant beneath it?')) return;
  try {
    await api('/api/dashboard/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kill-lineage' }),
    });
    state.passportUsed = false;
    setResult('Lineage killed. Existing grants now fail with HLM_6003.', 'deny');
    await refresh();
  } catch (error) {
    setResult(`Kill failed: ${error.message}`, 'deny');
  }
}

async function reset() {
  if (!window.confirm('Reset keys, grants, replay state and audit events?')) return;
  try {
    await api('/api/dashboard/reset', { method: 'POST' });
    state.passport = null;
    state.passportUsed = false;
    setResult('Demo reset. All in-memory state was cleared.', 'ok');
    await refresh();
  } catch (error) {
    setResult(`Reset failed: ${error.message}`, 'deny');
  }
}

$('btn-mint').addEventListener('click', mint);
$('btn-checkout').addEventListener('click', checkout);
$('btn-copy').addEventListener('click', copyPassport);
$('btn-kill').addEventListener('click', killLineage);
$('btn-reset').addEventListener('click', reset);
$('grant-rows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-revoke]');
  if (button && !button.disabled) revoke(button.dataset.revoke);
});

await refresh();
setInterval(refresh, 2000);
