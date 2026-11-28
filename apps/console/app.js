// Pascaal Console UI preview.
// Static prototype with mocked data. No auth backend, database, keys or billing.
// Nothing entered here is transmitted or stored.

const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const money = (cents) => `$${number.format(Math.max(0, Math.round((cents || 0) / 100)))}`;
const ago = (iso) => {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
};
const clock = (iso) => new Date(iso).toLocaleString([], { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
// Future grant expiry must read as a countdown, never as "0s ago".
const until = (iso) => {
  const secs = Math.ceil((new Date(iso).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(secs) || secs <= 0) return `expired ${ago(iso)}`;
  if (secs < 60) return `in ${secs}s`;
  if (secs < 3600) return `in ${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `in ${Math.floor(secs / 3600)}h`;
  return `in ${Math.floor(secs / 86400)}d`;
};
const isExpired = (iso) => new Date(iso).getTime() <= Date.now();

const VENDOR_FRAME = 'Freeroam seems to very adaptible on clients side as they can now decide to integrate it into any platform and be a vendor. They can easily see when agents use their website and analyse usage and traffic and even curb suspicous use.';

// Cost is expressed in mock cost units throughout the Console and the demo.
// 100 cost units = $1 in this preview; no billing processor is connected.
const COST_UNIT_NOTE = 'Mock cost units: 100 units = $1. No billing is connected.';

// Role model for this clickable preview. The hosted product would enforce the
// same matrix server-side; here it gates controls so the banner is not decorative.
const ROLE_MODEL = {
  owner: { label: 'owner', may: ['members', 'projects', 'keys', 'grants', 'billing'] },
  admin: { label: 'admin', may: ['members', 'projects', 'keys', 'grants', 'billing'] },
  developer: { label: 'developer', may: ['projects', 'keys', 'grants'] },
  viewer: { label: 'viewer', may: [] },
};
const ROLE_BANNER = 'Role model (preview): owner · admin · developer · viewer. Roles are per organization and enforced client-side here; the hosted product enforces them server-side.';

const PLANS = {
  Starter: { included: '5,000', overage: '$0.60 per 1,000', seats: '3 members', retention: '7 day receipts' },
  Growth: { included: '50,000', overage: '$0.40 per 1,000', seats: '10 members', retention: '30 day receipts' },
  Scale: { included: '250,000', overage: '$0.25 per 1,000', seats: 'Unlimited members', retention: '90 day receipts' },
};
const TIME_WINDOWS = { '24h': 86400000, '7d': 7 * 86400000, '14d': 14 * 86400000, all: Infinity };

// Deterministic pseudo-random so the mocked data is stable across reloads.
let seed = 20261127;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (arr) => (arr.length ? arr[Math.floor(rnd() * arr.length)] : undefined);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// ---------------------------------------------------------------------------
// Mocked data
// ---------------------------------------------------------------------------

const ROLES = ['owner', 'admin', 'developer', 'viewer'];
const SURFACES = ['checkout', 'account.update', 'api.write', 'license.issue', '/pricing', '/docs', 'search'];
const SPIDS = [
  'spid://northstar/checkout-agent',
  'spid://brightline/catalog-bot',
  'spid://civic/records-assistant',
  'spid://partner/unknown-crawler',
];
const FLAGS = ['new_spid', 'route_breadth_burst', 'high_method_variance', 'repeat_404s', 'off_hours_spike'];

const state = {
  session: null,
  activeOrg: null,
  authMode: 'signin',
  filters: {
    trafficSurface: 'all', trafficAttribution: 'all', trafficProject: 'all', trafficAgent: 'all', trafficTime: 'all',
    eventCode: 'all', eventSearch: '', eventProject: 'all', eventAgent: 'all', eventTime: 'all',
    redaction: true,
  },
  reveal: null, // { secret, orgId, projectId } — scoped to one org/project and cleared on navigation
  orgs: [
    { id: 'org_northstar', name: 'Northstar Labs', slug: 'northstar-labs', role: 'owner', plan: 'Scale', created: daysAgo(120) },
    { id: 'org_brightline', name: 'Brightline Retail', slug: 'brightline-retail', role: 'admin', plan: 'Growth', created: daysAgo(64) },
    { id: 'org_civic', name: 'Civic Health Data', slug: 'civic-health', role: 'viewer', plan: 'Starter', created: daysAgo(28) },
  ],
  members: [
    { id: 'usr_1', orgId: 'org_northstar', name: 'Alex Morgan', email: 'alex@northstar.example', role: 'owner', status: 'active', joined: daysAgo(120) },
    { id: 'usr_2', orgId: 'org_northstar', name: 'Priya Raman', email: 'priya@northstar.example', role: 'admin', status: 'active', joined: daysAgo(91) },
    { id: 'usr_3', orgId: 'org_northstar', name: 'Devon Lee', email: 'devon@northstar.example', role: 'developer', status: 'active', joined: daysAgo(44) },
    { id: 'usr_4', orgId: 'org_northstar', name: 'Sam Okafor', email: 'sam@northstar.example', role: 'viewer', status: 'invited', joined: daysAgo(2) },
    { id: 'usr_5', orgId: 'org_brightline', name: 'Alex Morgan', email: 'alex@northstar.example', role: 'admin', status: 'active', joined: daysAgo(64) },
    { id: 'usr_6', orgId: 'org_brightline', name: 'Rina Shah', email: 'rina@brightline.example', role: 'developer', status: 'active', joined: daysAgo(30) },
    { id: 'usr_7', orgId: 'org_civic', name: 'Alex Morgan', email: 'alex@northstar.example', role: 'viewer', status: 'active', joined: daysAgo(28) },
  ],
  projects: [
    { id: 'prj_storefront', orgId: 'org_northstar', name: 'Storefront gateway', env: 'production', tenant: 'tnt_northstar_prod', audience: 'https://gw.northstar.example/', created: daysAgo(100) },
    { id: 'prj_staging', orgId: 'org_northstar', name: 'Staging sandbox', env: 'development', tenant: 'tnt_northstar_dev', audience: 'https://gw.dev.northstar.example/', created: daysAgo(78) },
    { id: 'prj_catalog', orgId: 'org_brightline', name: 'Catalog API', env: 'production', tenant: 'tnt_brightline_prod', audience: 'https://api.brightline.example/', created: daysAgo(60) },
    { id: 'prj_records', orgId: 'org_civic', name: 'Records portal', env: 'production', tenant: 'tnt_civic_prod', audience: 'https://records.civic.example/', created: daysAgo(26) },
  ],
  keys: [
    { id: 'key_1', projectId: 'prj_storefront', name: 'Freeroam edge', prefix: 'pk_live_7Qx2', scopes: ['freeroam:observe'], created: daysAgo(88), lastUsed: minutesAgo(3), status: 'active' },
    { id: 'key_2', projectId: 'prj_storefront', name: 'Barricade gateway', prefix: 'pk_live_1Vm9', scopes: ['barricade:enforce', 'registry:read'], created: daysAgo(88), lastUsed: minutesAgo(1), status: 'active' },
    { id: 'key_3', projectId: 'prj_staging', name: 'Staging mint', prefix: 'pk_test_4Kp7', scopes: ['grants:mint'], created: daysAgo(40), lastUsed: daysAgo(3), status: 'active' },
    { id: 'key_4', projectId: 'prj_catalog', name: 'Catalog observer', prefix: 'pk_live_9Bz3', scopes: ['freeroam:observe'], created: daysAgo(50), lastUsed: minutesAgo(12), status: 'active' },
    { id: 'key_5', projectId: 'prj_records', name: 'Legacy verifier', prefix: 'pk_live_2Wc8', scopes: ['registry:read'], created: daysAgo(24), lastUsed: daysAgo(11), status: 'revoked' },
  ],
  agents: [
    { id: 'agt_1', orgId: 'org_northstar', name: 'Checkout Agent', spid: 'spid://northstar/checkout-agent', imprint: 'at_ns_0001', caps: ['commerce.checkout.v1'], status: 'active', created: daysAgo(70) },
    { id: 'agt_2', orgId: 'org_northstar', name: 'Catalog Reader', spid: 'spid://northstar/catalog-reader', imprint: 'at_ns_0002', caps: ['catalog.read.v1'], status: 'active', created: daysAgo(55) },
    { id: 'agt_3', orgId: 'org_brightline', name: 'Catalog Bot', spid: 'spid://brightline/catalog-bot', imprint: 'at_br_0001', caps: ['catalog.read.v1'], status: 'active', created: daysAgo(45) },
    { id: 'agt_4', orgId: 'org_civic', name: 'Records Assistant', spid: 'spid://civic/records-assistant', imprint: 'at_cv_0001', caps: ['records.read.v1'], status: 'revoked', created: daysAgo(20) },
  ],
  grants: [
    { id: 'gr_1', orgId: 'org_northstar', agentId: 'agt_1', jti: 'grant_ns_0142', session: 'ses_ns_0142', sqn: 142, cap: 'commerce.checkout.v1', status: 'used', expires: daysAgo(-0.02), remaining: '4 / 5 req', human: 'alex@northstar.example' },
    { id: 'gr_2', orgId: 'org_northstar', agentId: 'agt_2', jti: 'grant_ns_0143', session: 'ses_ns_0143', sqn: 143, cap: 'catalog.read.v1', status: 'active', expires: daysAgo(-0.04), remaining: '18 / 20 req', human: 'priya@northstar.example' },
    { id: 'gr_3', orgId: 'org_northstar', agentId: 'agt_1', jti: 'grant_ns_0144', session: 'ses_ns_0144', sqn: 144, cap: 'commerce.checkout.v1', status: 'revoked', expires: daysAgo(-0.01), remaining: '3 / 5 req', human: 'devon@northstar.example' },
    { id: 'gr_4', orgId: 'org_brightline', agentId: 'agt_3', jti: 'grant_br_0091', session: 'ses_br_0091', sqn: 91, cap: 'catalog.read.v1', status: 'active', expires: daysAgo(-0.03), remaining: '12 / 20 req', human: 'rina@brightline.example' },
    { id: 'gr_5', orgId: 'org_civic', agentId: 'agt_4', jti: 'grant_cv_0007', session: 'ses_cv_0007', sqn: 7, cap: 'records.read.v1', status: 'revoked', expires: daysAgo(-0.01), remaining: '14 / 20 req', human: 'alex@northstar.example' },
    { id: 'gr_6', orgId: 'org_northstar', agentId: 'agt_2', jti: 'grant_ns_0145', session: 'ses_ns_0145', sqn: 145, cap: 'catalog.read.v1', status: 'used', expires: daysAgo(1), remaining: '0 / 20 req', human: 'priya@northstar.example' },
  ],
  traffic: [],
  events: [],
  usage: [],
  invoices: [
    { id: 'inv_ns_03', orgId: 'org_northstar', period: '2026-10', amount: 48200, status: 'paid' },
    { id: 'inv_ns_04', orgId: 'org_northstar', period: '2026-11', amount: 61750, status: 'open' },
    { id: 'inv_br_02', orgId: 'org_brightline', period: '2026-11', amount: 21400, status: 'paid' },
    { id: 'inv_cv_01', orgId: 'org_civic', period: '2026-11', amount: 8900, status: 'paid' },
  ],
};

function minutesAgo(n) { return new Date(Date.now() - n * 60000).toISOString(); }

// Populate mocked Freeroam observations, Trackline events and usage.
for (let i = 0; i < 120; i += 1) {
  const org = pick(state.orgs).id;
  const project = pick(state.projects.filter((p) => p.orgId === org)) || state.projects[0];
  const attributed = rnd() > 0.22;
  const spid = attributed ? pick(SPIDS.slice(0, 3)) : null;
  const flags = [];
  if (rnd() > 0.93) flags.push(pick(FLAGS));
  if (rnd() > 0.97) flags.push('route_breadth_burst');
  state.traffic.push({
    id: `obs_${String(i + 1).padStart(4, '0')}`,
    orgId: org,
    projectId: project.id,
    surface: pick(SURFACES),
    method: pick(['GET', 'GET', 'GET', 'POST', 'PUT']),
    path: pick(['/products', '/pricing', '/checkout', '/account', '/docs', '/search']),
    spid,
    attributed,
    flags,
    ts: daysAgo(rnd() * 14),
  });
}
state.traffic.sort((a, b) => new Date(b.ts) - new Date(a.ts));

const EVENT_TYPES = [
  ['passport.observed', '', 'ok'],
  ['passport.accepted', '', 'ok'],
  ['passport.rejected', 'HLM_1003', 'deny'],
  ['passport.rejected', 'HLM_1005', 'deny'],
  ['grant.replayed', 'HLM_2004', 'deny'],
  ['grant.revoked', 'HLM_6002', 'deny'],
  ['attestation.revoked', 'HLM_6003', 'deny'],
  ['revocation.stale', 'HLM_6004', 'deny'],
  ['budget.charged', '', 'ok'],
];
for (let i = 0; i < 40; i += 1) {
  const [event, code, tone] = pick(EVENT_TYPES);
  const org = pick(state.orgs).id;
  const agent = pick(state.agents.filter((a) => a.orgId === org)) || state.agents[0];
  const orgGrants = state.grants.filter((g) => g.orgId === org);
  const human = pick(['alex@northstar.example', 'priya@northstar.example', 'rina@brightline.example']);
  state.events.push({
    id: `evt_${String(i + 1).padStart(4, '0')}`,
    orgId: org,
    projectId: state.projects.find((p) => p.orgId === org)?.id || 'prj_demo',
    ts: daysAgo(rnd() * 10),
    event,
    code,
    tone,
    surface: pick(['checkout', 'account.update', 'api.write']),
    spid: agent.spid,
    jti: (orgGrants.length ? pick(orgGrants).jti : 'grant_demo_0001'),
    human,
    // Explicit fields so the redaction toggle can reveal azp, ln and cnf.
    azp: human,
    ln: `ln_demo_${String(i + 1).padStart(4, '0')}`,
    cnf: `jkt_demo_${String((i * 37) % 991).padStart(4, '0')}`,
  });
}
state.events.sort((a, b) => new Date(b.ts) - new Date(a.ts));

for (let d = 13; d >= 0; d -= 1) {
  state.orgs.forEach((org) => {
    state.usage.push({
      orgId: org.id,
      day: daysAgo(d),
      observed: Math.floor(60 + rnd() * 220),
      enforced: Math.floor(10 + rnd() * 60),
      minted: Math.floor(2 + rnd() * 18),
      receipts: Math.floor(40 + rnd() * 180),
    });
  });
}

// ---------------------------------------------------------------------------
// Small view helpers
// ---------------------------------------------------------------------------

const org = () => state.orgs.find((o) => o.id === state.activeOrg) || state.orgs[0];
const orgName = (id) => state.orgs.find((o) => o.id === id)?.name || id;
const projectName = (id) => state.projects.find((p) => p.id === id)?.name || id;
const forOrg = (arr) => arr.filter((item) => item.orgId === state.activeOrg);
const keysForOrg = () => state.keys.filter((k) => state.projects.some((p) => p.id === k.projectId && p.orgId === state.activeOrg));
const can = (ability) => (ROLE_MODEL[org().role]?.may || []).includes(ability);

// Signed-in identity appears in the member list instead of being decorative.
function syncSignedInMember(email) {
  if (!email) return;
  state.orgs.forEach((o) => {
    if (state.members.some((m) => m.orgId === o.id && m.email.toLowerCase() === email.toLowerCase())) return;
    state.members.push({
      id: `usr_${o.id}_${state.members.length + 1}`, orgId: o.id, name: email.split('@')[0],
      email, role: o.role, status: 'active', joined: new Date().toISOString(),
    });
  });
}

function createOrgWithStarter(name, email) {
  const id = `org_${Date.now()}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
  state.orgs.push({ id, name, slug, role: 'owner', plan: 'Starter', created: new Date().toISOString() });
  state.members.push({
    id: `usr_${Date.now()}`, orgId: id, name: (email || 'you@company.com').split('@')[0],
    email: email || 'you@company.com', role: 'owner', status: 'active', joined: new Date().toISOString(),
  });
  const suffix = Math.random().toString(36).slice(2, 7);
  state.projects.push({
    id: `prj_${suffix}`, orgId: id, name: 'Starter project', env: 'development',
    tenant: `tnt_${suffix}`, audience: `https://gw.${suffix}.example/`, created: new Date().toISOString(), starter: true,
  });
  state.activeOrg = id;
  return id;
}

let toastTimer;
function toast(message) {
  // The live region stays in the DOM; visibility is CSS-only.
  const el = $('toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('visible'); }, 3200);
}

function confirmAction(message) {
  return window.confirm(message);
}

// Capture the focused control before a render replaces the DOM, then put focus
// back on the equivalent control (filters, selects and action buttons included).
function focusDescriptor(el) {
  if (!el || !$('screen').contains(el)) return null;
  const parts = [el.tagName.toLowerCase()];
  for (const attr of ['data-action', 'data-filter', 'data-org', 'data-member', 'data-key', 'data-grant', 'data-agent', 'id']) {
    if (el.hasAttribute(attr)) parts.push(`[${attr}="${CSS.escape(el.getAttribute(attr))}"]`);
  }
  if (parts.length === 1) return null;
  return { selector: parts.join(''), start: el.selectionStart };
}

function restoreFocus(descriptor) {
  if (!descriptor) return;
  const next = $('screen').querySelector(descriptor.selector);
  if (!next || next.disabled) return;
  next.focus();
  if (descriptor.start !== null && descriptor.start !== undefined && next.setSelectionRange) {
    try { next.setSelectionRange(descriptor.start, descriptor.start); } catch { /* not a text input */ }
  }
}

function head(num, title, sub, actions = '') {
  return `
    <div class="screen-head">
      <div>
        <p class="eyebrow">${esc(num)} · Pascaal Console</p>
        <h2>${esc(title)}</h2>
        <p class="sub">${sub}</p>
      </div>
      ${actions ? `<div class="screen-actions">${actions}</div>` : ''}
    </div>`;
}

function badge(text, tone = '') {
  return `<span class="badge ${esc(tone)}">${esc(text)}</span>`;
}

function barChart(rows, key, label = 'Observed') {
  if (!rows.length) return '<p class="hint">No mocked observations for this organization yet.</p>';
  const max = Math.max(1, ...rows.map((r) => r[key]));
  // The table is the accessible data equivalent of the visual bars.
  const data = `
    <table class="sr-only">
      <caption>${esc(label)} per day (mocked)</caption>
      <thead><tr><th scope="col">Day</th><th scope="col">${esc(label)}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.day.slice(0, 10))}</td><td>${number.format(r[key])}</td></tr>`).join('')}</tbody>
    </table>`;
  return `
    <div class="bar-chart" role="img" aria-label="${esc(label)} per day; exact values in the following table">
      ${rows.map((r) => `<div class="bar" style="height:${Math.max(4, Math.round((r[key] / max) * 100))}%" title="${number.format(r[key])}"></div>`).join('')}
    </div>
    <div class="chart-labels"><span>${ago(rows[0].day)}</span><span>today</span></div>${data}`;
}

// Shared mocked filters for the traffic and receipt screens.
function filterControls(prefix) {
  const suffix = prefix === 'traffic' ? 'surface' : 'code';
  const options = prefix === 'traffic'
    ? SURFACES.map((s) => `<option value="${esc(s)}" ${s === state.filters.trafficSurface ? 'selected' : ''}>${esc(s)}</option>`).join('')
    : ['HLM_1003', 'HLM_1005', 'HLM_2004', 'HLM_6002', 'HLM_6003', 'HLM_6004'].map((c) => `<option value="${c}" ${c === state.filters.eventCode ? 'selected' : ''}>${c}</option>`).join('');
  const agentOptions = forOrg(state.agents).map((a) => `<option value="${esc(a.spid)}" ${a.spid === state.filters[`${prefix}Agent`] ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const projectOptions = state.projects.filter((p) => p.orgId === state.activeOrg).map((p) => `<option value="${esc(p.id)}" ${p.id === state.filters[`${prefix}Project`] ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  return `
    <div class="filter-row">
      <label class="mono muted filter-label" for="${prefix}-${suffix}">${prefix === 'traffic' ? 'Surface' : 'Code'}</label>
      <select id="${prefix}-${suffix}" data-action="filter-${prefix}" data-filter="${prefix}${prefix === 'traffic' ? 'Surface' : 'Code'}">
        <option value="all">All ${prefix === 'traffic' ? 'surfaces' : 'codes'}</option>${options}
      </select>
      <label class="mono muted filter-label" for="${prefix}-project">Project</label>
      <select id="${prefix}-project" data-action="filter-${prefix}" data-filter="${prefix}Project">
        <option value="all">All projects</option>${projectOptions}
      </select>
      <label class="mono muted filter-label" for="${prefix}-agent">Agent</label>
      <select id="${prefix}-agent" data-action="filter-${prefix}" data-filter="${prefix}Agent">
        <option value="all">All agents</option>${agentOptions}
      </select>
      <label class="mono muted filter-label" for="${prefix}-time">Time window</label>
      <select id="${prefix}-time" data-action="filter-${prefix}" data-filter="${prefix}Time">
        ${Object.keys(TIME_WINDOWS).map((w) => `<option value="${w}" ${w === state.filters[`${prefix}Time`] ? 'selected' : ''}>${w === 'all' ? 'All time' : `Last ${w}`}</option>`).join('')}
      </select>
      ${prefix === 'traffic' ? `
      <label class="mono muted filter-label" for="traffic-attribution">Attribution</label>
      <select id="traffic-attribution" data-action="filter-traffic" data-filter="trafficAttribution">
        <option value="all">All traffic</option>
        <option value="attributed" ${state.filters.trafficAttribution === 'attributed' ? 'selected' : ''}>Attributed</option>
        <option value="unattributed" ${state.filters.trafficAttribution === 'unattributed' ? 'selected' : ''}>Unattributed</option>
      </select>` : `
      <label class="mono muted filter-label" for="event-search">Search</label>
      <input id="event-search" type="search" data-action="filter-events" data-filter="eventSearch" value="${esc(state.filters.eventSearch)}" placeholder="Search event or code">`}
    </div>`;
}

function inTimeWindow(ts, windowKey) {
  const span = TIME_WINDOWS[windowKey] ?? Infinity;
  return new Date(ts).getTime() >= Date.now() - span;
}

// ---------------------------------------------------------------------------
// Screen renderers
// ---------------------------------------------------------------------------

function screenOverview() {
  const activeGrants = forOrg(state.grants).filter((g) => g.status === 'active').length;
  const traffic = forOrg(state.traffic);
  const attributed = traffic.filter((t) => t.attributed).length;
  const rate = traffic.length ? Math.round((attributed / traffic.length) * 100) : 0;
  const projectCount = state.projects.filter((p) => p.orgId === state.activeOrg).length;

  return `
    ${head('01', 'Overview', `A human-owned control plane for agent authority in <strong>${esc(org().name)}</strong>. This is a UI preview with mocked data.`, '<a class="button" href="#/docs">Read agent docs ↗</a>')}
    <div class="callout warn">
      <strong>Preview boundary.</strong> Sign-in is simulated; no password, key,
      grant or invoice here is real. Use the local provider demo for the working
      Freeroam → Barricade flow.
    </div>
    <div class="callout section" role="note">
      <strong>Role model.</strong> ${ROLE_BANNER} Active role in ${esc(org().name)}:
      ${badge(org().role, org().role === 'owner' ? 'info' : '')}.
    </div>

    <div class="grid-4 section">
      <div class="stat"><span class="label">Organizations</span><span class="value">${state.orgs.length}</span><span class="note">you belong to ${state.orgs.length}</span></div>
      <div class="stat"><span class="label">Projects</span><span class="value">${projectCount}</span><span class="note">tenant + audience pairs</span></div>
      <div class="stat"><span class="label">Active grants</span><span class="value">${activeGrants}</span><span class="note">short-lived authority</span></div>
      <div class="stat"><span class="label">Attributed traffic</span><span class="value">${rate}%</span><span class="note">of observed requests</span></div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <h3 class="section-title"><span class="mono">01</span> Isolation boundaries</h3>
        <table>
          <tbody>
            <tr><td class="mono">Organization</td><td>${esc(org().id)}</td></tr>
            <tr><td class="mono">Your role</td><td>${badge(org().role, org().role === 'owner' ? 'info' : '')}</td></tr>
            <tr><td class="mono">Plan</td><td>${esc(org().plan)}</td></tr>
            <tr><td class="mono">Protocol</td><td>Hallmark v1 draft · not ratified</td></tr>
          </tbody>
        </table>
        <p class="hint">Every read and write is scoped by organization, then project/tenant.</p>
      </div>
      <div class="card card-pad">
        <h3 class="section-title"><span class="mono">02</span> The loop</h3>
        <table>
          <tbody>
            <tr><td class="mono">Freeroam</td><td>Observe, attribute, flag anomalies. Never denies.</td></tr>
            <tr><td class="mono">Barricade</td><td>Check the exact grant at the responsible action.</td></tr>
            <tr><td class="mono">Trackline</td><td>Keep a PII-redacted receipt with pinned codes.</td></tr>
            <tr><td class="mono">Leash</td><td>Human issues and revokes authority.</td></tr>
          </tbody>
        </table>
        <p class="hint">Observation and enforcement are separate paths. A visit is not a grant.</p>
      </div>
    </div>`;
}

function screenOrganizations() {
  const members = state.members.filter((m) => m.orgId === state.activeOrg);
  return `
    ${head('02', 'Organizations & roles', 'Organizations are the permission and billing boundary. Roles are scoped per organization and enforced in this preview.', `<button class="button button-blue" type="button" data-action="toggle-form" data-target="create-org-form" ${can('members') ? '' : 'disabled title="Your role cannot create organizations"'}>New organization</button>`)}
    <div class="callout section" role="note"><strong>Role model.</strong> ${ROLE_BANNER}</div>

    <form id="create-org-form" class="card card-pad section" data-action="create-org" hidden>
      <h3 class="section-title"><span class="mono">+</span> Create organization</h3>
      <div class="inline-form">
        <label class="field"><span>Name</span><input id="new-org-name" type="text" placeholder="Acme Robotics" required ${can('members') ? '' : 'disabled'}></label>
        <button class="button button-primary" type="submit" ${can('members') ? '' : 'disabled'}>Create &amp; switch</button>
        <button class="button button-quiet" type="button" data-action="toggle-form" data-target="create-org-form">Cancel</button>
      </div>
    </form>

    <div class="doc-grid section">
      ${state.orgs.map((o) => `
        <div class="doc-card ${o.id === state.activeOrg ? 'callout' : ''}" style="${o.id === state.activeOrg ? 'border-left-width:3px' : ''}">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
            <h3>${esc(o.name)}</h3>${badge(o.role, o.role === 'owner' ? 'info' : '')}
          </div>
          <span class="path">${esc(o.slug)} · ${esc(o.plan)} · ${esc((ROLE_MODEL[o.role]?.may || []).join(', ') || 'read only')}</span>
          <p>${state.members.filter((m) => m.orgId === o.id).length} members · created ${ago(o.created)}</p>
          <button class="button button-small" type="button" data-action="switch-org" data-org="${esc(o.id)}" ${o.id === state.activeOrg ? 'disabled' : ''}>${o.id === state.activeOrg ? 'Active' : 'Switch to'}</button>
        </div>`).join('')}
    </div>

    <div class="card">
      <div class="card-head"><h3>Members of ${esc(org().name)}</h3>${badge(`${members.length} people`)}</div>
      <div class="card-pad">
        <form class="inline-form" data-action="invite-member" style="margin-bottom:20px">
          <label class="field"><span>Invite by email</span><input id="invite-email" type="email" placeholder="teammate@company.com" required ${can('members') ? '' : 'disabled'}></label>
          <label class="field" style="max-width:170px"><span>Role</span><select id="invite-role" ${can('members') ? '' : 'disabled'}>${ROLES.slice(1).map((r) => `<option value="${r}">${r}</option>`).join('')}</select></label>
          <button class="button button-primary" type="submit" ${can('members') ? '' : 'disabled title="Your role cannot manage members"'}>Send invite</button>
        </form>
        ${can('members') ? '' : '<p class="hint">Read-only role: member management is disabled for viewers and developers.</p>'}
        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Joined</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              ${members.length ? members.map((m) => `
                <tr>
                  <td><strong>${esc(m.name)}</strong>${m.email === state.session ? ' ' + badge('you', 'info') : ''}<span class="sub mono">${esc(m.email)}</span></td>
                  <td>
                    <select data-action="change-role" data-member="${esc(m.id)}" ${m.role === 'owner' || !can('members') ? 'disabled' : ''}>
                      ${ROLES.filter((r) => r !== 'owner').map((r) => `<option value="${r}" ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                  </td>
                  <td>${badge(m.status, m.status === 'active' ? 'ok' : 'warn')}</td>
                  <td class="mono">${ago(m.joined)}</td>
                  <td class="row-actions"><button class="link-action link-danger" type="button" data-action="remove-member" data-member="${esc(m.id)}" ${m.role === 'owner' || !can('members') ? 'disabled' : ''}>Remove</button></td>
                </tr>`).join('') : '<tr><td colspan="5" class="empty">No members in this organization yet.</td></tr>'}
            </tbody>
          </table>
        </div>
        <p class="hint">Invites, role changes and removals would be audited in the hosted product.</p>
      </div>
    </div>`;
}

function screenProjects() {
  const projects = state.projects.filter((p) => p.orgId === state.activeOrg);
  const keys = keysForOrg();
  // A revealed example secret belongs to exactly one org/project and is not
  // shown after switching organizations or navigating away.
  const reveal = state.reveal && state.reveal.orgId === state.activeOrg
    && projects.some((p) => p.id === state.reveal.projectId) ? state.reveal : null;

  return `
    ${head('03', 'Projects & API keys', 'A project carries the tenant and audience used by gateways. Keys are scoped and revocable.', `<button class="button button-blue" type="button" data-action="toggle-form" data-target="create-project-form" ${can('projects') ? '' : 'disabled title="Your role cannot create projects"'}>New project</button>`)}
    ${can('projects') ? '' : '<div class="callout warn section"><strong>Read-only role.</strong> Project and key controls are disabled for your current role.</div>'}

    <form id="create-project-form" class="card card-pad section" data-action="create-project" hidden>
      <h3 class="section-title"><span class="mono">+</span> Create project</h3>
      <div class="inline-form">
        <label class="field"><span>Name</span><input id="new-project-name" type="text" placeholder="Payments gateway" required ${can('projects') ? '' : 'disabled'}></label>
        <label class="field"><span>Environment</span><select id="new-project-env" ${can('projects') ? '' : 'disabled'}><option>production</option><option>development</option></select></label>
        <button class="button button-primary" type="submit" ${can('projects') ? '' : 'disabled'}>Create project</button>
        <button class="button button-quiet" type="button" data-action="toggle-form" data-target="create-project-form">Cancel</button>
      </div>
      <p class="hint">The hosted product generates a unique <span class="mono">tnt_*</span> tenant and <span class="mono">aud</span> automatically.</p>
    </form>

    <div class="card section">
      <div class="card-head"><h3>Projects</h3>${badge(`${projects.length} in ${org().name}`)}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Project</th><th scope="col">Environment</th><th scope="col">Tenant</th><th scope="col">Audience</th><th scope="col">Keys</th></tr></thead>
          <tbody>
            ${projects.length ? projects.map((p) => `
              <tr>
                <td><strong>${esc(p.name)}</strong><span class="sub mono">${esc(p.id)}</span></td>
                <td>${badge(p.env, p.env === 'production' ? 'info' : 'warn')}</td>
                <td class="mono">${esc(p.tenant)}</td>
                <td class="mono">${esc(p.audience)}</td>
                <td class="mono">${state.keys.filter((k) => k.projectId === p.id).length}</td>
              </tr>`).join('') : '<tr><td colspan="5" class="empty">No projects in this organization yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>API keys</h3>
        <button class="button button-small button-blue" type="button" data-action="toggle-form" data-target="create-key-form" ${can('keys') ? '' : 'disabled title="Your role cannot issue keys"'}>Issue key</button>
      </div>
      <div class="card-pad">
        <form id="create-key-form" class="inline-form" data-action="create-key" hidden style="margin-bottom:18px">
          <label class="field"><span>Project</span><select id="key-project" ${can('keys') ? '' : 'disabled'}>${projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Name</span><input id="key-name" type="text" placeholder="Edge verifier" required ${can('keys') ? '' : 'disabled'}></label>
          <label class="field"><span>Scope</span><select id="key-scope" ${can('keys') ? '' : 'disabled'}>
            <option value="freeroam:observe">freeroam:observe</option>
            <option value="barricade:enforce">barricade:enforce</option>
            <option value="grants:mint">grants:mint</option>
            <option value="registry:read">registry:read</option>
          </select></label>
          <button class="button button-primary" type="submit" ${can('keys') ? '' : 'disabled'}>Issue key</button>
        </form>

        ${reveal ? `
          <div class="secret-reveal">
            <span>Shown once for ${esc(projectName(reveal.projectId))} — copy now:<br><strong>${esc(reveal.secret)}</strong></span>
            <button class="button button-small" type="button" data-action="copy-secret" data-secret="${esc(reveal.secret)}">Copy</button>
            <button class="button button-small button-quiet" type="button" data-action="dismiss-secret">Dismiss</button>
          </div>` : ''}

        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">Key</th><th scope="col">Project</th><th scope="col">Scopes</th><th scope="col">Last used</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              ${keys.length ? keys.map((k) => `
                <tr>
                  <td><strong>${esc(k.name)}</strong><span class="sub mono">${esc(k.prefix)}••••••••</span></td>
                  <td>${esc(projectName(k.projectId))}</td>
                  <td class="mono">${k.scopes.map((s) => esc(s)).join('<br>')}</td>
                  <td class="mono">${ago(k.lastUsed)}</td>
                  <td>${badge(k.status, k.status === 'active' ? 'ok' : 'danger')}</td>
                  <td class="row-actions"><button class="link-action link-danger" type="button" data-action="revoke-key" data-key="${esc(k.id)}" ${k.status === 'revoked' || !can('keys') ? 'disabled' : ''}>Revoke</button></td>
                </tr>`).join('') : '<tr><td colspan="6" class="empty">No keys in this organization yet.</td></tr>'}
            </tbody>
          </table>
        </div>
        <p class="hint">Production stores only a hash and prefix. These example secrets are strings, not credentials.</p>
      </div>
    </div>`;
}

function screenAgents() {
  const agents = forOrg(state.agents);
  const grants = forOrg(state.grants);
  return `
    ${head('04', 'Agents & grants', 'An imprint binds a responsible human to an agent key. A grant authorizes one exact action.', '')}
    <div class="callout ok">
      <strong>Authority, not visits.</strong> A grant is a short-lived permission
      for a specific capability. Revoking a session stops one grant; killing a
      lineage stops the root imprint and every grant beneath it.
    </div>

    <div class="card section">
      <div class="card-head"><h3>Agents</h3>${badge(`${agents.length} in ${org().name}`)}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Agent</th><th scope="col">SPID</th><th scope="col">Imprint</th><th scope="col">Capabilities</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            ${agents.length ? agents.map((a) => `
              <tr>
                <td><strong>${esc(a.name)}</strong><span class="sub mono">${esc(a.id)}</span></td>
                <td class="mono">${esc(a.spid)}</td>
                <td class="mono">${esc(a.imprint)}</td>
                <td class="mono">${a.caps.map((c) => esc(c)).join('<br>')}</td>
                <td>${badge(a.status, a.status === 'active' ? 'ok' : 'danger')}</td>
                <td class="row-actions"><button class="link-action link-danger" type="button" data-action="kill-lineage" data-agent="${esc(a.id)}" ${a.status === 'revoked' || !can('grants') ? 'disabled' : ''}>Kill lineage</button></td>
              </tr>`).join('') : '<tr><td colspan="6" class="empty">No agents in this organization yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Active and recent grants</h3>${badge(`${grants.length} total`)}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Grant (jti)</th><th scope="col">Session</th><th scope="col">sqn</th><th scope="col">Capability</th><th scope="col">Status</th><th scope="col">Expires</th><th scope="col">Budget</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            ${grants.length ? grants.map((g) => `
              <tr>
                <td class="mono">${esc(g.jti)}<span class="sub">${esc(g.human)}</span></td>
                <td class="mono">${esc(g.session)}</td>
                <td class="mono">${g.sqn}</td>
                <td class="mono">${esc(g.cap)}</td>
                <td>${badge(g.status, g.status === 'active' ? 'ok' : g.status === 'revoked' ? 'danger' : 'info')}${isExpired(g.expires) ? ' ' + badge('expired', 'warn') : ''}</td>
                <td class="mono">${esc(until(g.expires))}</td>
                <td class="mono">${esc(g.remaining)}</td>
                <td class="row-actions"><button class="link-action link-danger" type="button" data-action="revoke-grant" data-grant="${esc(g.id)}" ${g.status === 'revoked' || !can('grants') ? 'disabled' : ''}>Revoke</button></td>
              </tr>`).join('') : '<tr><td colspan="8" class="empty">No grants in this organization yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="hint">Budgets stay at their last recorded total when a grant is revoked or a lineage is killed. Stale revocation fails closed on grant surfaces; there is no silent fail-open.</p>
    </div>`;
}

function screenTraffic() {
  const all = forOrg(state.traffic);
  const surface = state.filters.trafficSurface;
  const attribution = state.filters.trafficAttribution;
  const rows = all.filter((t) => (surface === 'all' || t.surface === surface)
    && (attribution === 'all' || (attribution === 'attributed' ? t.attributed : !t.attributed))
    && (state.filters.trafficProject === 'all' || t.projectId === state.filters.trafficProject)
    && (state.filters.trafficAgent === 'all' || t.spid === state.filters.trafficAgent)
    && inTimeWindow(t.ts, state.filters.trafficTime));
  const attributed = all.filter((t) => t.attributed).length;
  const rate = all.length ? Math.round((attributed / all.length) * 100) : 0;
  const anomalies = all.filter((t) => t.flags.length).length;
  const spids = new Set(all.filter((t) => t.spid).map((t) => t.spid)).size;
  const daily = state.usage.filter((u) => u.orgId === state.activeOrg).slice().reverse();

  return `
    ${head('05', 'Traffic intelligence', `Freeroam observations for ${esc(org().name)}. Read-only, safe events only.`, '<a class="button" href="#/agents">View grants →</a>')}

    <blockquote class="quote section">
      <span class="quote-label">Product framing — preserved wording</span>
      ${esc(VENDOR_FRAME)}
    </blockquote>

    <div class="callout section">
      <strong>Observes and flags, never denies.</strong> Freeroam is adaptable on
      the client side: a platform can integrate it into any web surface and see
      when cooperative agents use the site. It records attribution, route breadth
      and anomalies. To curb suspicious use, define a signed
      <strong>Barricade</strong> surface at the first responsible action —
      checkout, write, license, destructive operation. This is responsibility
      resolution, not bot detection.
    </div>

    <div class="grid-4 section">
      <div class="stat"><span class="label">Observations</span><span class="value">${all.length}</span><span class="note">last 14 days</span></div>
      <div class="stat"><span class="label">Attributed</span><span class="value">${rate}%</span><span class="note">with agent identity</span></div>
      <div class="stat"><span class="label">Anomaly flags</span><span class="value">${anomalies}</span><span class="note">signals, not denials</span></div>
      <div class="stat"><span class="label">Unique SPIDs</span><span class="value">${spids}</span><span class="note">observed agents</span></div>
    </div>

    <div class="card section">
      <div class="card-head"><h3>Observed requests per day</h3><span class="mono muted">Freeroam only</span></div>
      <div class="card-pad">${barChart(daily, 'observed')}</div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Observation stream</h3>${badge(`${rows.length} rows`)}</div>
      <div class="card-pad">
        ${filterControls('traffic')}
        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">Time</th><th scope="col">Project</th><th scope="col">Surface</th><th scope="col">Method / path</th><th scope="col">Agent (SPID)</th><th scope="col">Flags</th></tr></thead>
            <tbody>
              ${rows.length ? rows.slice(0, 24).map((t) => `
                <tr>
                  <td class="mono">${ago(t.ts)}</td>
                  <td>${esc(projectName(t.projectId))}</td>
                  <td class="mono">${esc(t.surface)}</td>
                  <td class="mono">${esc(t.method)} ${esc(t.path)}</td>
                  <td class="mono">${t.attributed ? esc(t.spid) : '<span class="faint">unattributed</span>'}</td>
                  <td>${t.flags.length ? t.flags.map((f) => badge(f, 'warn')).join(' ') : '<span class="faint">—</span>'}</td>
                </tr>`).join('') : '<tr><td colspan="6" class="empty">No observations match these filters.</td></tr>'}
            </tbody>
          </table>
        </div>
        <p class="hint">Anomaly flags are signals for a human, not automatic blocks. No request was denied on this screen.</p>
      </div>
    </div>`;
}

function eventMeta(e) {
  const mask = (value) => state.filters.redaction ? '••••••' : (value || '—');
  return `${e.code ? `${e.code} · ` : ''}${e.surface} · spid ${e.spid} · azp ${mask(e.azp || e.human)} · ln ${mask(e.ln)} · cnf ${mask(e.cnf)} · jti ${e.jti}`;
}

function screenTrackline() {
  const all = forOrg(state.events);
  const search = state.filters.eventSearch.toLowerCase();
  const rows = all.filter((e) => (state.filters.eventCode === 'all' || e.code === state.filters.eventCode)
    && (!search || e.event.toLowerCase().includes(search) || e.code.toLowerCase().includes(search))
    && (state.filters.eventProject === 'all' || e.projectId === state.filters.eventProject)
    && (state.filters.eventAgent === 'all' || e.spid === state.filters.eventAgent)
    && inTimeWindow(e.ts, state.filters.eventTime));

  return `
    ${head('06', 'Trackline', 'PII-redacted receipts with pinned HLM_ codes. Every denial is safe to log.', `<button class="button" type="button" data-action="toggle-redaction">${state.filters.redaction ? 'Show identifiers' : 'Redact identifiers'}</button><button class="button button-small" type="button" disabled title="Export is disabled in this UI preview">Export receipts</button>`)}
    <div class="callout section">
      <strong>Redaction is on by default.</strong> The <span class="mono">azp</span>,
      <span class="mono">ln</span> and <span class="mono">cnf</span> fields are
      each explicitly masked in the receipt stream and revealed together by the
      toggle. Export is disabled in this preview; in the hosted product it would
      produce a signed receipt bundle.
    </div>

    <div class="card">
      <div class="card-head"><h3>Receipt stream</h3>${badge(`${rows.length} events`)}</div>
      <div class="card-pad">
        ${filterControls('event')}
        <ul class="event-list">
          ${rows.length ? rows.slice(0, 30).map((e) => `
            <li class="event">
              <span class="event-time mono">${ago(e.ts)}</span>
              <span class="event-name ${e.tone}">${esc(e.event)}</span>
              <span class="event-meta">${esc(eventMeta(e))}</span>
            </li>`).join('') : '<li class="empty">No receipts match these filters.</li>'}
        </ul>
      </div>
    </div>`;
}

function screenUsage() {
  const rows = state.usage.filter((u) => u.orgId === state.activeOrg).slice().reverse();
  const invoices = state.invoices.filter((i) => i.orgId === state.activeOrg);
  const sum = (key) => rows.reduce((t, r) => t + r[key], 0);
  const current = invoices.find((i) => i.status === 'open');
  const plan = PLANS[org().plan] || PLANS.Starter;

  return `
    ${head('07', 'Usage & billing', `Metered examples for ${esc(org().name)}. All amounts and volumes are mocked.`, `<span class="pill">${esc(org().plan)} plan</span>`)}
    <div class="callout warn section">
      <strong>Billing is mocked.</strong> No payment processor, meter or invoice is
      connected to this preview. ${COST_UNIT_NOTE} Invoices below are illustrative
      examples, not bills. In the hosted product, usage would come from observed
      and enforced events.
    </div>

    <div class="grid-4 section">
      <div class="stat"><span class="label">Observed</span><span class="value">${number.format(sum('observed'))}</span><span class="note">Freeroam events</span></div>
      <div class="stat"><span class="label">Enforced</span><span class="value">${number.format(sum('enforced'))}</span><span class="note">Barricade decisions</span></div>
      <div class="stat"><span class="label">Grants minted</span><span class="value">${number.format(sum('minted'))}</span><span class="note">per-action authority</span></div>
      <div class="stat"><span class="label">Receipts</span><span class="value">${number.format(sum('receipts'))}</span><span class="note">Trackline events</span></div>
    </div>

    <div class="card section">
      <div class="card-head"><h3>Observed usage per day</h3><span class="mono muted">14 days</span></div>
      <div class="card-pad">${barChart(rows, 'observed', 'Observed')}</div>
    </div>

    <div class="card section">
      <div class="card-head"><h3>Plan tiers</h3><span class="mono muted">mock limits</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Tier</th><th scope="col">Included / month</th><th scope="col">Overage</th><th scope="col">Members</th><th scope="col">Receipt retention</th></tr></thead>
          <tbody>${Object.entries(PLANS).map(([name, details]) => `
            <tr${name === org().plan ? ' class="current-plan"' : ''}><td><strong>${esc(name)}</strong>${name === org().plan ? ' ' + badge('current', 'info') : ''}</td><td class="mono">${esc(details.included)}</td><td class="mono">${esc(details.overage)}</td><td>${esc(details.seats)}</td><td>${esc(details.retention)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <h3 class="section-title"><span class="mono">01</span> Current plan</h3>
        <table><tbody>
          <tr><td class="mono">Plan</td><td><strong>${esc(org().plan)}</strong></td></tr>
          <tr><td class="mono">Included</td><td class="mono">${esc(plan.included)} observed / mo</td></tr>
          <tr><td class="mono">Overage</td><td class="mono">${esc(plan.overage)}</td></tr>
          <tr><td class="mono">Open invoice</td><td>${current ? money(current.amount) + ' · ' + esc(current.period) : 'none'}</td></tr>
          <tr><td class="mono">Cost unit</td><td>${COST_UNIT_NOTE}</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <div class="card-head"><h3>Invoices <span class="mono muted">illustrative</span></h3></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">Period</th><th scope="col">Amount (cost units)</th><th scope="col">Status</th></tr></thead>
            <tbody>${invoices.length ? invoices.map((i) => `
              <tr><td class="mono">${esc(i.period)}</td><td class="mono">${money(i.amount)}</td><td>${badge(i.status, i.status === 'paid' ? 'ok' : 'warn')}</td></tr>`).join('') : '<tr><td colspan="3" class="empty">No illustrative invoices for this organization.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

const SETUP_PROMPT = `You are integrating Pascaal Hallmark with this project.
1. Install @pascaal/freeroam and @pascaal/barricade (or use the repo workspaces until @pascaal is published).
2. Mount Freeroam read-only on public routes. It observes cooperative agent traffic and emits safe events. It never denies.
3. Define a signed Barricade policy at the first responsible action (checkout, write, license, destructive).
4. Require a short-lived per-action grant with jti, sqn, capability and budget. Fail closed on stale revocation.
5. Record PII-redacted Trackline receipts with pinned HLM_ codes.
6. Do not call Hallmark ratified or certified until spec §21 closes. Use "Hallmark v1-draft conformant — spec commit <sha>".`;

function screenDocs() {
  const docs = [
    ['llms.txt', '/llms.txt', 'Short agent index with canonical links, statuses and boundaries.'],
    ['llms-full.txt', '/llms-full.txt', 'Full product brief: identity model, Freeroam framing, codes, verification.'],
    ['Agent brief', '/agent/', 'Plain HTML view of the product facts for answer engines.'],
    ['Architecture', 'https://github.com/Addyx2/hallmark/blob/main/docs/product-architecture.md', 'Target console architecture and build order.'],
    ['Protocol site', 'https://hallmark.pascaal.com/', 'Hallmark protocol, spec and WebCrypto seal verifier.'],
    ['Protocol llms.txt', 'https://hallmark.pascaal.com/llms.txt', 'Agent index for the protocol surface.'],
  ];
  return `
    ${head('08', 'Docs for agents', 'The same facts for humans and agents. Copyable, canonical and honest about boundaries.', '')}
    <div class="doc-grid section">
      ${docs.map(([title, path, desc]) => `
        <div class="doc-card">
          <h3>${esc(title)}</h3>
          <span class="path">${esc(path)}</span>
          <p>${esc(desc)}</p>
          <div style="display:flex;gap:8px;margin-top:auto">
            <a class="button button-small" href="${esc(path)}" ${path.startsWith('http') ? 'target="_blank" rel="noreferrer"' : ''}>Open ↗</a>
            <button class="button button-small button-quiet" type="button" data-action="copy-text" data-text="${esc(path)}">Copy path</button>
          </div>
        </div>`).join('')}
    </div>

    <div class="card section">
      <div class="card-head"><h3>Setup prompt for coding agents</h3><button class="button button-small" type="button" data-action="copy-text" data-text="${esc(SETUP_PROMPT)}">Copy prompt</button></div>
      <div class="card-pad"><pre class="code-block">${esc(SETUP_PROMPT)}</pre></div>
    </div>

    <div class="callout">
      <strong>No OpenAPI contract yet.</strong> <span class="mono">docs/openapi.json</span>
      is deliberately deferred until the managed service exists. Do not invent
      endpoints from this preview.
    </div>`;
}

function screenSettings() {
  const email = state.session || 'you@company.com';
  const initial = email.charAt(0).toUpperCase();
  return `
    ${head('09', 'Settings', 'Preview-only controls. Resetting clears the mocked changes made in this browser session.', '')}
    <div class="grid-2">
      <div class="card card-pad">
        <h3 class="section-title"><span class="mono">01</span> Profile</h3>
        <table><tbody>
          <tr><td class="mono">Signed in as</td><td>${esc(email)}${state.members.some((m) => m.email === email && m.orgId === state.activeOrg) ? ' ' + badge('member', 'ok') : ''}</td></tr>
          <tr><td class="mono">Active role</td><td>${badge(org().role, org().role === 'owner' ? 'info' : '')}</td></tr>
          <tr><td class="mono">Session</td><td>Mock · browser memory only</td></tr>
          <tr><td class="mono">Authentication</td><td>Simulated; no password sent or stored</td></tr>
        </tbody></table>
      </div>
      <div class="card card-pad">
        <h3 class="section-title"><span class="mono">02</span> Security model (target)</h3>
        <p class="hint">
          WebAuthn/OIDC preferred, magic link bootstrap, short sessions with
          httpOnly cookies, hashed API keys, CSRF protection, rate limits,
          org-scoped authorization and audited break-glass access. No remote key
          resolution; no silent fail-open on stale revocation.
        </p>
      </div>
    </div>
    <div class="card card-pad section" style="border-color:#f0c9c4">
      <h3 class="section-title" style="color:var(--red)"><span class="mono">!</span> Danger zone</h3>
      <p class="hint">Restore the original mocked organizations, members, projects, keys, grants, traffic, receipts and usage.</p>
      <button class="button button-danger" type="button" data-action="reset-preview">Reset preview data</button>
    </div>`;
}

const SCREENS = {
  overview: screenOverview,
  organizations: screenOrganizations,
  projects: screenProjects,
  agents: screenAgents,
  traffic: screenTraffic,
  trackline: screenTrackline,
  usage: screenUsage,
  docs: screenDocs,
  settings: screenSettings,
};

// ---------------------------------------------------------------------------
// Routing, auth and rendering
// ---------------------------------------------------------------------------

function currentRoute() {
  const route = (location.hash || '#/overview').replace(/^#\/?/, '').split('/')[0];
  return SCREENS[route] ? route : 'overview';
}

function render() {
  if (!state.session) return;
  const route = currentRoute();
  const screen = $('screen');
  const focus = focusDescriptor(document.activeElement);
  screen.innerHTML = SCREENS[route]();
  document.querySelectorAll('.side-nav a').forEach((a) => {
    const active = a.dataset.nav === route;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  restoreFocus(focus);
  screen.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderOrgSwitcher() {
  const switcher = $('org-switcher');
  const wasFocused = document.activeElement === switcher;
  switcher.innerHTML = state.orgs.map((o) => `<option value="${esc(o.id)}" ${o.id === state.activeOrg ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
  if (wasFocused) switcher.focus();
}

function enterConsole(email, keepActiveOrg = false) {
  state.session = email || 'alex@northstar.example';
  if (!keepActiveOrg) state.activeOrg = state.orgs[0].id;
  syncSignedInMember(state.session);
  $('auth-screen').hidden = true;
  $('app-shell').hidden = false;
  $('user-initial').textContent = state.session.charAt(0).toUpperCase();
  renderOrgSwitcher();
  if (!location.hash || !SCREENS[currentRoute()] || location.hash === '#/') location.hash = '#/overview';
  render();
  $('screen').focus();
  toast(`Mock session opened for ${state.session}`);
}

function leaveConsole() {
  state.session = null;
  state.reveal = null;
  $('app-shell').hidden = true;
  $('auth-screen').hidden = false;
  location.hash = '';
  $('auth-password').value = '';
}

function setAuthMode(mode) {
  state.authMode = mode;
  $('tab-signin').classList.toggle('active', mode === 'signin');
  $('tab-signup').classList.toggle('active', mode === 'signup');
  // These are toggle buttons, not ARIA tabs: no incomplete tabpanel contract.
  $('tab-signin').setAttribute('aria-pressed', String(mode === 'signin'));
  $('tab-signup').setAttribute('aria-pressed', String(mode === 'signup'));
  $('auth-title').textContent = mode === 'signin' ? 'Welcome back' : 'Create your workspace';
  $('auth-subtitle').textContent = mode === 'signin'
    ? 'Continue to your organizations.'
    : 'A new organization and a starter project are created automatically.';
  $('org-field').hidden = mode !== 'signup';
  $('auth-form').querySelector('button[type="submit"]').textContent = mode === 'signin' ? 'Sign in' : 'Create account';
}

async function copyText(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} to clipboard.`);
  } catch {
    toast('Clipboard unavailable in this preview.');
  }
}

function resetPreview() {
  // Reload re-creates the deterministic mock data; no stale seed to clear.
  location.reload();
}

// ---------------------------------------------------------------------------
// Interaction handlers
// ---------------------------------------------------------------------------

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'toggle-form') {
    const form = $(el.dataset.target);
    if (form) form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input')?.focus();
    return;
  }
  if (action === 'signin-mode' || action === 'signup-mode') {
    setAuthMode(action === 'signup-mode' ? 'signup' : 'signin');
    return;
  }
  if (action === 'switch-org') {
    state.activeOrg = el.dataset.org;
    state.reveal = null;
    renderOrgSwitcher();
    render();
    toast(`Switched to ${org().name}.`);
    return;
  }
  if (action === 'remove-member') {
    if (!can('members')) return;
    if (!confirmAction('Remove this member from the organization?')) return;
    state.members = state.members.filter((m) => m.id !== el.dataset.member);
    render();
    toast('Member removed (mock).');
    return;
  }
  if (action === 'revoke-key') {
    if (!can('keys')) return;
    if (!confirmAction('Revoke this API key? Gateways would see it as revoked on next refresh.')) return;
    const key = state.keys.find((k) => k.id === el.dataset.key);
    if (key) key.status = 'revoked';
    render();
    toast('API key revoked (mock).');
    return;
  }
  if (action === 'dismiss-secret') {
    state.reveal = null;
    render();
    return;
  }
  if (action === 'copy-secret') {
    copyText(el.dataset.secret, 'Example secret copied');
    return;
  }
  if (action === 'revoke-grant') {
    if (!can('grants')) return;
    if (!confirmAction('Revoke this grant session? The next responsible action would fail with HLM_6002.')) return;
    const grant = state.grants.find((g) => g.id === el.dataset.grant);
    if (grant) {
      // Keep the recorded budget total; revocation changes state, not history.
      grant.status = 'revoked';
      grant.revokedAt = new Date().toISOString();
      state.events.unshift({
        id: `evt_new_${Date.now()}`, orgId: grant.orgId,
        projectId: state.projects.find((p) => p.orgId === grant.orgId)?.id || 'prj_demo',
        ts: new Date().toISOString(),
        event: 'grant.revoked', code: 'HLM_6002', tone: 'deny',
        surface: grant.cap, spid: state.agents.find((a) => a.id === grant.agentId)?.spid || 'unknown',
        jti: grant.jti, human: grant.human, azp: grant.human,
        ln: `ln_${grant.id}`, cnf: `jkt_demo_${grant.sqn}`,
      });
    }
    render();
    toast('Grant session revoked (mock).');
    return;
  }
  if (action === 'kill-lineage') {
    if (!can('grants')) return;
    if (!confirmAction('Kill this root imprint and every grant beneath it?')) return;
    const agent = state.agents.find((a) => a.id === el.dataset.agent);
    if (agent) {
      agent.status = 'revoked';
      // Preserve each grant's last recorded budget while changing its state.
      state.grants.filter((g) => g.agentId === agent.id).forEach((g) => {
        g.status = 'revoked';
        g.revokedAt = new Date().toISOString();
      });
      state.events.unshift({
        id: `evt_new_${Date.now()}`, orgId: agent.orgId,
        projectId: state.projects.find((p) => p.orgId === agent.orgId)?.id || 'prj_demo',
        ts: new Date().toISOString(),
        event: 'lineage.killed', code: 'HLM_6003', tone: 'deny',
        surface: 'imprint', spid: agent.spid, jti: 'all-descendants', human: state.session,
        azp: state.session, ln: `ln_${agent.id}`, cnf: `jkt_demo_${agent.id}`,
      });
    }
    render();
    toast('Lineage killed (mock).');
    return;
  }
  if (action === 'toggle-redaction') {
    state.filters.redaction = !state.filters.redaction;
    render();
    toast(state.filters.redaction ? 'Identifiers redacted.' : 'Identifiers revealed (mock).');
    return;
  }
  if (action === 'copy-text') {
    copyText(el.dataset.text, 'Copied');
    return;
  }
  if (action === 'reset-preview') {
    if (!confirmAction('Reset all mocked changes in this preview?')) return;
    resetPreview();
  }
});

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'change-role') {
    if (!can('members')) return;
    const member = state.members.find((m) => m.id === el.dataset.member);
    if (member && member.role !== 'owner' && el.value !== 'owner') member.role = el.value;
    render();
    toast(`Role changed to ${el.value} (mock).`);
    return;
  }
  if (action === 'filter-traffic' || action === 'filter-events') {
    state.filters[el.dataset.filter] = el.value;
    render();
  }
});

document.addEventListener('input', (event) => {
  const el = event.target.closest('[data-action="filter-events"][data-filter="eventSearch"]');
  if (!el) return;
  state.filters.eventSearch = el.value;
  render(); // render() restores focus and caret for the search input.
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;
  event.preventDefault();
  const action = form.dataset.action;

  if (action === 'auth') {
    const email = $('auth-email').value.trim();
    if (!email) return;
    if (state.authMode === 'signup') {
      // "Create account" really creates a new org (and its starter project)
      // instead of renaming the first mocked organization.
      const name = $('auth-org').value.trim() || `${email.split('@')[0]}'s workspace`;
      createOrgWithStarter(name, email);
      enterConsole(email, true);
      return;
    }
    enterConsole(email);
    return;
  }
  if (action === 'create-org') {
    if (!can('members')) return;
    const name = $('new-org-name').value.trim();
    if (!name) return;
    createOrgWithStarter(name, state.session);
    renderOrgSwitcher();
    render();
    toast(`Created ${name} with a starter project (mock).`);
    return;
  }
  if (action === 'invite-member') {
    if (!can('members')) return;
    const email = $('invite-email').value.trim();
    if (!email) return;
    const role = $('invite-role').value;
    state.members.push({
      id: `usr_${Date.now()}`, orgId: state.activeOrg, name: email.split('@')[0],
      email, role, status: 'invited', joined: new Date().toISOString(),
    });
    render();
    toast(`Invited ${email} as ${role} (mock).`);
    return;
  }
  if (action === 'create-project') {
    if (!can('projects')) return;
    const name = $('new-project-name').value.trim();
    if (!name) return;
    const env = $('new-project-env').value;
    const suffix = Math.random().toString(36).slice(2, 7);
    state.projects.push({
      id: `prj_${suffix}`, orgId: state.activeOrg, name, env,
      tenant: `tnt_${suffix}`, audience: `https://gw.${suffix}.example/`, created: new Date().toISOString(),
    });
    render();
    toast(`Created project ${name} (mock).`);
    return;
  }
  if (action === 'create-key') {
    if (!can('keys')) return;
    const name = $('key-name').value.trim();
    if (!name) return;
    const projectId = $('key-project').value;
    const scope = $('key-scope').value;
    const secret = `${scope.startsWith('freeroam') ? 'pk_live' : 'pk_test'}_${Math.random().toString(36).slice(2, 14)}`;
    state.keys.push({
      id: `key_${Date.now()}`, projectId, name, prefix: secret.slice(0, 12),
      scopes: [scope], created: new Date().toISOString(), lastUsed: new Date().toISOString(), status: 'active',
    });
    state.reveal = { secret, orgId: state.activeOrg, projectId };
    render();
    toast('Example key issued (mock).');
  }
});

// A route change closes any one-time secret display, even within the same screen.
window.addEventListener('hashchange', () => {
  state.reveal = null;
  render();
});

$('tab-signin').addEventListener('click', () => setAuthMode('signin'));
$('tab-signup').addEventListener('click', () => setAuthMode('signup'));

$('magic-link').addEventListener('click', () => {
  toast('Demo only — no email is sent. Use the form to open the console.');
});

$('org-switcher').addEventListener('change', (event) => {
  state.activeOrg = event.target.value;
  state.reveal = null;
  renderOrgSwitcher();
  render();
  toast(`Switched to ${org().name}.`);
});

$('logout').addEventListener('click', () => {
  leaveConsole();
  $('logout').blur();
  toast('Signed out of the mock session.');
});

// The identity chip is deliberately not a menu: no account surface is mocked.
setAuthMode('signin');
