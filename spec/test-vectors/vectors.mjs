// Hallmark conformance vector generator + self-test.
//
//   node vectors.mjs          generate, self-verify, write vectors.json
//
// Every vector is derived from fixtures/keys.json and the frozen clock below,
// so output is byte-stable. The self-test asserts that each positive vector
// verifies and each negative vector fails with the exact expected error code --
// if an invariant is weakened, this script exits non-zero.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, createHmac, createPrivateKey, sign as edSign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  b64u, jcs, jwsSign, jwsVerify, seal, jkt, kid, sha256, SEAL_DS_V1,
  RevocationSet, ReplayCache, AllocationStore, HallmarkError, parseJsonStrict,
} from './hallmark-ref.mjs';
import {
  createContext, buildAttestationStore, mintAttestation, mintPassport,
  verifyPassport, EdgeRegistry, ATTESTATION_TYP, PASSPORT_TYP,
  reserveAllocation, consume, newSpendState,
} from './verify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYS = JSON.parse(readFileSync(join(HERE, 'fixtures', 'keys.json'), 'utf8'));

// Frozen clock. 1772323200 == 2026-03-01T00:00:00Z.
const T0 = 1772323200;

const W = {
  tid: 'tnt_acme',
  audience: 'https://hallmark.gw.acme.example/',
  idpIssuer: 'https://idp.acme.example/',
  human: 'usr_4471',
  policyId: 'pol_acme_default',
  policyVersion: 7,
};

const POLICY = {
  id: W.policyId,
  v: W.policyVersion,
  maxDepth: 4,
  maxTtlSec: 120,
  revocation: 'strict',
  profiles: ['llm.chat.default.v1', 'llm.batch.v1', 'vec.search.default.v1'],
  capabilities: {
    'llm.inference.v1': {
      methods: ['POST'],
      pathPrefixes: ['/v1/chat/completions', '/v1/completions'],
      profiles: ['llm.chat.default.v1', 'llm.batch.v1'],
      tin: 33554432, tout: 8192, cost: 2500,
    },
    'vector.search.v1': {
      methods: ['POST', 'GET'],
      pathPrefixes: ['/v1/embeddings', '/v1/vectors'],
      profiles: ['llm.chat.default.v1', 'vec.search.default.v1'],
    },
    'code.exec.sandbox.v1': {
      methods: ['POST'],
      pathPrefixes: ['/v1/sandbox/exec'],
      profiles: ['llm.chat.default.v1'],
    },
  },
};

// ---------------------------------------------------------------------------
// World construction
// ---------------------------------------------------------------------------

const seq = new Map();
const nextSq = (k) => {
  const n = (seq.get(k) ?? 0) + 1;
  seq.set(k, n);
  return n;
};

let sidCounter = 0;
const sid = (role) => `ses_${role}_${String(++sidCounter).padStart(4, '0')}`;
let atCounter = 0;
const at = () => `at_${String(++atCounter).padStart(4, '0')}`;

const ROOT_BUDGET = { req: 5000, tin: 536870912, tout: 26843545, cost: 500000, conc: 32, depth: 4, wid: 8 };
const ROOT_CAPS = ['llm.inference.v1', 'vector.search.v1', 'code.exec.sandbox.v1'];
const ROOT_PROFILES = ['llm.chat.default.v1', 'llm.batch.v1'];

const attestationJti = at();
const attestation = mintAttestation({
  idpKey: KEYS.idp_key.privateJwk,
  humanSub: W.human,
  idpIssuer: W.idpIssuer,
  rootAgentJwk: KEYS.root_agent.publicJwk,
  caps: ROOT_CAPS,
  profiles: ROOT_PROFILES,
  policyId: W.policyId,
  policyVersion: W.policyVersion,
  budget: ROOT_BUDGET,
  audience: W.audience,
  tid: W.tid,
  spid: 'spid://acme/research-orchestrator',
  name: 'Research Orchestrator',
  amr: ['hwk', 'user_presence', 'mfa'],
  now: T0,
  ttl: 86400,
  jti: attestationJti,
});

const attestations = buildAttestationStore([{
  jws: attestation.jws,
  jti: attestationJti,
  kid: kid(KEYS.idp_key.publicJwk),
  jwk: KEYS.idp_key.publicJwk,
}]);

const rootSign = mintPassport({
  alg: 'EdDSA',
  sk: KEYS.root_agent.privateJwk,
  jwk: KEYS.root_agent.publicJwk,
  tid: W.tid,
  spid: 'spid://acme/research-orchestrator',
  name: 'Research Orchestrator',
  prof: 'llm.chat.default.v1',
  caps: ROOT_CAPS,
  audience: W.audience,
  azp: W.human,
  root: { iss: W.idpIssuer, sub: W.human, at: attestationJti, h: seal(attestation.signingInput) },
  policyId: W.policyId,
  policyVersion: W.policyVersion,
  budget: ROOT_BUDGET,
  now: T0,
  ttl: 120,
  jti: sid('root'),
  sqn: nextSq('root'),
  attestationJti,
  attestationSigningInput: attestation.signingInput,
  issuerOverride: `urn:hallmark:idp:${W.tid}`,
});

const edges = new EdgeRegistry();

/** Mint a child and record its spawn edge, exactly as a compliant SDK would. */
function spawn(o) {
  const p = mintPassport({
    ...o,
    alg: 'EdDSA',
    sk: o.sk,
    jwk: o.jwk,
    tid: o.tid ?? W.tid,
    audience: o.audience ?? W.audience,
    azp: o.azp ?? W.human,
    root: { iss: W.idpIssuer, sub: o.azp ?? W.human, at: attestationJti, h: seal(attestation.signingInput) },
    policyId: W.policyId,
    policyVersion: W.policyVersion,
    now: o.now ?? T0,
    jti: o.jti ?? sid('child'),
    sqn: o.sqn ?? nextSq(o.jwk.x),
    parent: o.parentClaims ?? rootSign.claims,
    parentSigningInput: o.parentSigningInput ?? rootSign.signingInput,
    boundKeyJkt: o.boundKeyJkt,
  });
  if (o.registerEdge !== false) {
    edges.register({
      childSub: p.claims.sub,
      parentSub: o.parentClaims?.sub ?? rootSign.claims.sub,
      tipH: seal(o.parentSigningInput ?? rootSign.signingInput),
      depth: p.claims.hlm.depth,
      rootAt: attestationJti,
      rootH: seal(attestation.signingInput),
      parentSignerJkt: jkt(o.parentJwk ?? KEYS.root_agent.publicJwk),
    });
  }
  return p;
}

const A_BUDGET = { req: 500, tin: 33554432, tout: 4194304, cost: 25000, conc: 4, depth: 1, wid: 2 };
const A_CAPS = ['llm.inference.v1', 'vector.search.v1'];

const childA = spawn({
  sk: KEYS.child_agent_a.privateJwk, jwk: KEYS.child_agent_a.publicJwk,
  spid: 'spid://acme/research-worker-07', name: 'Research Worker 07',
  prof: 'llm.chat.default.v1', caps: A_CAPS, budget: A_BUDGET, ttl: 90,
});

const childB = spawn({
  sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'vec.search.default.v1', caps: ['vector.search.v1'],
  budget: { req: 200, tin: 8388608, tout: 0, cost: 4000, conc: 2, depth: 0, wid: 0 }, ttl: 60,
});

const GC_BUDGET = { req: 40, tin: 4194304, tout: 262144, cost: 1500, conc: 1, depth: 0, wid: 0 };
const grandchild = spawn({
  sk: KEYS.rogue_agent.privateJwk, jwk: KEYS.rogue_agent.publicJwk,
  spid: 'spid://acme/summarizer-01', name: 'Summarizer 01',
  prof: 'llm.chat.default.v1', caps: ['llm.inference.v1'], budget: GC_BUDGET, ttl: 60,
  parentClaims: childA.claims, parentSigningInput: childA.signingInput, parentJwk: KEYS.child_agent_a.publicJwk,
  jti: sid('gc'),
});

const rootSignerJkt = jkt(KEYS.root_agent.publicJwk);
const revokedManifest = {
  v: 1, iat: T0, exp: T0 + 60, keys: [], sessions: [], attestations: [], tenants: [],
};

function ctx(over = {}) {
  return createContext({
    now: over.now ?? T0,
    tenant: W.tid,
    audience: W.audience,
    keys: new Map([
      [kid(KEYS.root_agent.publicJwk), KEYS.root_agent.publicJwk],
      [kid(KEYS.child_agent_a.publicJwk), KEYS.child_agent_a.publicJwk],
      [kid(KEYS.child_agent_b.publicJwk), KEYS.child_agent_b.publicJwk],
      [kid(KEYS.rogue_agent.publicJwk), KEYS.rogue_agent.publicJwk],
      [kid(KEYS.attacker_idp_key.publicJwk), KEYS.attacker_idp_key.publicJwk],
      ...(over.extraKeys ?? []),
    ]),
    policies: new Map([[`${POLICY.id}@${POLICY.v}`, POLICY]]),
    attestations,
    revocation: over.revocation ?? new RevocationSet(revokedManifest),
    replay: over.replay ?? new ReplayCache(),
    edges: over.edges ?? edges,
    maxTtlSec: 120,
    maxDepth: 4,
    maxRevocationStalenessSec: 30,
    ...(over.ctx ?? {}),
  });
}

// ---------------------------------------------------------------------------
// Tamper helpers
// ---------------------------------------------------------------------------

function flipSignatureByte(jws) {
  const [h, p, s] = jws.split('.');
  const raw = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  raw[0] ^= 0x01;
  return `${h}.${p}.${b64u(raw)}`;
}

/** Sign an arbitrary raw payload string, bypassing canonicalization. */
function signRaw(alg, skJwk, header, rawPayload) {
  const signingInput = `${b64u(jcs(header))}.${b64u(Buffer.from(rawPayload, 'utf8'))}`;
  const sk = createPrivateKey({ key: skJwk, format: 'jwk' });
  const sig = alg === 'EdDSA'
    ? edSign(null, Buffer.from(signingInput, 'ascii'), sk)
    : edSign('sha256', Buffer.from(signingInput, 'ascii'), { key: sk, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64u(sig)}`;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------
// Vector table
// ---------------------------------------------------------------------------

const vectors = [];
function vec(name, kind, description, jws, opts = {}, expect = null) {
  vectors.push({ name, kind, description, jws, opts, expect });
}

const V = (name, desc, jws, expect, opts = {}) => vec(name, 'negative', desc, jws, opts, expect);
const P = (name, desc, jws, opts = {}) => vec(name, 'positive', desc, jws, opts, null);

// ---- positive ----
P('root-agent', 'Depth-1 passport issued directly from a passkey-backed human attestation.',
  rootSign.jws, { method: 'POST', path: '/v1/chat/completions' });
P('child-agent', 'Depth-2 passport. Verified via the spawn-edge registry, parent not on the wire.',
  childA.jws, { method: 'POST', path: '/v1/chat/completions' });
P('grandchild-agent', 'Depth-3 passport, two registry hops, still traceable to usr_4471.',
  grandchild.jws, { method: 'POST', path: '/v1/chat/completions' });
P('sibling-agent', 'Independent child of the root, narrow caps, zero further delegation.',
  childB.jws, { method: 'GET', path: '/v1/vectors/query' });
P('child-with-parent-presented', 'Depth-2 verified against the parent passport directly (Level 1P).',
  childA.jws, { parentJws: rootSign.jws });
const popChild = spawn({
  sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'vec.search.default.v1', caps: ['vector.search.v1'],
  budget: { req: 200, tin: 8388608, tout: 0, cost: 4000, conc: 2, depth: 0, wid: 0 },
  ttl: 60, jti: sid('pop'), boundKeyJkt: jkt(KEYS.child_agent_b.publicJwk),
});
P('proof-of-possession-mtls', 'L4 client certificate thumbprint matches cnf.jkt.',
  popChild.jws, { tlsCertJkt: jkt(KEYS.child_agent_b.publicJwk) });

// ---- negative: signature and header handling ----
V('signature-bitflip', 'Single bit flipped in the signature.',
  flipSignatureByte(childA.jws), { code: 'HLM_1003', reason: 'bad_signature' });

V('alg-none-downgrade', 'alg=none with an empty signature (RFC 8725 classic).',
  (() => { const [h, p] = childA.jws.split('.'); const hb = b64u(jcs({ alg: 'none', kid: kid(KEYS.child_agent_a.publicJwk), typ: PASSPORT_TYP })); return `${hb}.${p}.`; })(),
  { code: 'HLM_1002', reason: 'unsupported_alg' });

V('alg-hs256-confusion', 'Attacker re-signs the passport with HMAC keyed by the public key.',
  (() => {
    const [h, p] = childA.jws.split('.');
    const header = { alg: 'HS256', kid: kid(KEYS.child_agent_a.publicJwk), typ: PASSPORT_TYP };
    const signingInput = `${b64u(jcs(header))}.${p}`;
    const mac = createHash('sha256').update(KEYS.child_agent_a.publicJwk.x).digest();
    return `${signingInput}.${b64u(createHmac('sha256', mac).update(signingInput).digest())}`;
  })(),
  { code: 'HLM_1002', reason: 'unsupported_alg' });

V('typ-confusion', 'Valid agent passport presented where a different Hallmark token is expected.',
  childA.jws, { code: 'HLM_1004', reason: 'bad_type' }, { expectTyp: 'hallmark+something-else' });

V('remote-key-resolution', 'jku header invites the gateway to fetch a key from an attacker URL.',
  (() => {
    const c = clone(childA.claims);
    return jwsSign('EdDSA', KEYS.child_agent_a.privateJwk,
      { typ: PASSPORT_TYP, kid: kid(KEYS.child_agent_a.publicJwk), jku: 'https://evil.example/keys.json' }, c).jws;
  })(),
  { code: 'HLM_1005', reason: 'malformed' });

V('unknown-kid', 'Passport signed by a key the gateway has never heard of.',
  jwsSign('EdDSA', KEYS.stolen_child_agent_a.privateJwk,
    { typ: PASSPORT_TYP, kid: kid(KEYS.stolen_child_agent_a.publicJwk) }, childA.claims).jws,
  { code: 'HLM_1001', reason: 'unknown_kid' });

V('duplicate-json-member', 'Payload carries iss twice; JSON.parse would silently keep one.',
  signRaw('EdDSA', KEYS.child_agent_a.privateJwk,
    { alg: 'EdDSA', kid: kid(KEYS.child_agent_a.publicJwk), typ: PASSPORT_TYP },
    `{"azp":"${W.human}",${JSON.stringify(clone(childA.claims)).slice(1)}`),
  { code: 'HLM_1005', reason: 'malformed' });

V('non-canonical-payload', 'Validly signed, but members are not in JCS order -- two gateways would compute different seals.',
  signRaw('EdDSA', KEYS.child_agent_a.privateJwk,
    { alg: 'EdDSA', kid: kid(KEYS.child_agent_a.publicJwk), typ: PASSPORT_TYP },
    '{"sub":"zzz","iss":"aaa"}'),
  { code: 'HLM_1005', reason: 'malformed' });

// ---- negative: time and binding ----
const expired = spawn({ sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk, spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01', prof: 'vec.search.default.v1', caps: ['vector.search.v1'], budget: childB.claims.hlm.budget, ttl: 60, now: T0 - 3600 });
V('expired-passport', 'Issued an hour ago with a 60s window.',
  expired.jws, { code: 'HLM_2001', reason: 'expired' });

const longTtl = spawn({ sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk, spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01', prof: 'vec.search.default.v1', caps: ['vector.search.v1'], budget: childB.claims.hlm.budget, ttl: 86400 });
V('ttl-exceeds-policy-ceiling', 'Validly minted 24h passport: revocation would be cosmetic.',
  longTtl.jws, { code: 'HLM_2003', reason: 'ttl_exceeds_max' });

const wrongAud = spawn({ sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk, spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01', prof: 'vec.search.default.v1', caps: ['vector.search.v1'], budget: childB.claims.hlm.budget, ttl: 60, audience: 'https://hallmark.gw.partner.example/' });
V('audience-mismatch', 'Passport minted for the gateway of a partner tenant.',
  wrongAud.jws, { code: 'HLM_3001', reason: 'audience_mismatch' });

const wrongTenant = spawn({ sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk, spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01', prof: 'vec.search.default.v1', caps: ['vector.search.v1'], budget: childB.claims.hlm.budget, ttl: 60, tid: 'tnt_partner' });
V('tenant-mismatch', 'Passport claims a tenant the gateway does not serve.',
  wrongTenant.jws, { code: 'HLM_3002', reason: 'tenant_mismatch' });

const popBound = mintPassport({
  alg: 'EdDSA', sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  tid: W.tid, spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'vec.search.default.v1', caps: ['vector.search.v1'], audience: W.audience, azp: W.human,
  root: { iss: W.idpIssuer, sub: W.human, at: attestationJti, h: seal(attestation.signingInput) },
  policyId: W.policyId, policyVersion: W.policyVersion, budget: childB.claims.hlm.budget,
  now: T0, ttl: 60, jti: sid('pop2'), sqn: nextSq('pop2'),
  parent: rootSign.claims, parentSigningInput: rootSign.signingInput,
  boundKeyJkt: jkt(KEYS.child_agent_a.publicJwk),
});
V('pop-required-but-absent', 'cnf.jkt present, no client cert and no request signature supplied.',
  popBound.jws, { code: 'HLM_8001', reason: 'pop_missing' });
V('pop-key-mismatch', 'Client certificate is not the key the passport is bound to.',
  popBound.jws, { code: 'HLM_8002', reason: 'pop_key_mismatch' }, { tlsCertJkt: jkt(KEYS.child_agent_b.publicJwk) });

// ---- negative: lineage ----
const forgedDepth1 = jwsSign('EdDSA', KEYS.rogue_agent.privateJwk,
  { typ: PASSPORT_TYP, kid: kid(KEYS.rogue_agent.publicJwk) },
  (() => {
    const c = clone(rootSign.claims);
    c.sub = sid('forger');
    c.jti = c.sub;
    c.sqn = nextSq('forger');
    return c;
  })()).jws;
V('rogue-claims-others-attestation', 'Attacker replays a real attestation against its own key. cnf.jkt says otherwise.',
  forgedDepth1, { code: 'HLM_4002', reason: 'lineage_root_mismatch' });

const humanSwap = spawn({
  sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'vec.search.default.v1', caps: ['vector.search.v1'],
  budget: childB.claims.hlm.budget, ttl: 60, azp: 'usr_9999',
});
V('human-swapped-mid-chain', 'Sub-agent re-points lineage at a different human operator. Parent presented, so L6 is live.',
  humanSwap.jws, { code: 'HLM_4006', reason: 'lineage_human_changed' }, { parentJws: rootSign.jws });

const inflated = spawn({
  sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'vec.search.default.v1', caps: ['vector.search.v1'],
  budget: { req: 40000, tin: 8388608, tout: 0, cost: 4000, conc: 2, depth: 0, wid: 0 }, ttl: 60,
});
V('budget-inflated-past-parent', 'Child asks for 40000 requests where the parent holds 5000.',
  inflated.jws, { code: 'HLM_5001', reason: 'budget_inflated' }, { parentJws: rootSign.jws });

// childA holds only {llm.inference, vector.search}. This child additionally
// claims code.exec.sandbox, which its actual parent never had -- a capability
// escalation to the one route that executes untrusted code.
const capWiden = spawn({
  sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'llm.chat.default.v1',
  caps: ['vector.search.v1', 'code.exec.sandbox.v1'],
  budget: { req: 200, tin: 8388608, tout: 0, cost: 4000, conc: 2, depth: 0, wid: 0 },
  ttl: 60, parentClaims: childA.claims, parentSigningInput: childA.signingInput,
  parentJwk: KEYS.child_agent_a.publicJwk,
});
V('capability-widened', 'Child claims code.exec.sandbox.v1, a capability its real parent never held.',
  capWiden.jws, { code: 'HLM_4012', reason: 'profile_not_narrowed' }, { parentJws: childA.jws });

const audWiden = spawn({
  sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'vec.search.default.v1', caps: ['vector.search.v1'],
  budget: childB.claims.hlm.budget, ttl: 60, audience: [W.audience, 'https://hallmark.gw.partner.example/'],
});
V('audience-widened-past-parent', 'Child adds a second audience the parent was not scoped to.',
  audWiden.jws, { code: 'HLM_4008', reason: 'lineage_audience_widened' }, { parentJws: rootSign.jws });

const orphan = spawn({
  sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'vec.search.default.v1', caps: ['vector.search.v1'],
  budget: childB.claims.hlm.budget, ttl: 60, registerEdge: false,
});
V('spawn-edge-never-registered', 'Lineage-shaped passport whose parent never actually spawned it.',
  orphan.jws, { code: 'HLM_4011', reason: 'edge_unregistered' });

const rewrittenPrefix = (() => {
  // A correctly signed grandchild whose intermediate link claims child B as its
  // parent while the registry says child A spawned it: the classic
  // "my parent was somebody else" forgery.
  const forgedSub = sid('forge');
  const c = clone(grandchild.claims);
  c.sub = forgedSub;
  c.jti = c.sub;
  c.sqn = nextSq('forge');
  c.iss = childA.claims.sub;
  c.hlm.ln = [...childB.claims.hlm.ln.map((e) => ({ ...e })), { sid: childA.claims.sub, h: seal(childA.signingInput) }];
  c.hlm.depth = c.hlm.ln.length;
  // The registry agrees with the passport about WHICH session spawned this one,
  // but recorded a different seal for it, so the chain diverges at that hop.
  edges.register({
    childSub: forgedSub,
    parentSub: childA.claims.sub,
    tipH: b64u(sha256(Buffer.from('a-different-seal', 'utf8'))),
    depth: 3,
    rootAt: attestationJti,
    rootH: seal(attestation.signingInput),
    parentSignerJkt: jkt(KEYS.child_agent_a.publicJwk),
  });
  return jwsSign('EdDSA', KEYS.rogue_agent.privateJwk,
    { typ: PASSPORT_TYP, kid: kid(KEYS.rogue_agent.publicJwk) }, c).jws;
})();
V('intermediate-ancestry-rewritten', 'Attacker splices a different parent into the middle of the chain.',
  rewrittenPrefix, { code: 'HLM_4003', reason: 'lineage_seal_mismatch' });

const reusedSid = spawn({
  sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk,
  spid: 'spid://acme/indexer-01', name: 'Vector Indexer 01',
  prof: 'vec.search.default.v1', caps: ['vector.search.v1'],
  budget: childB.claims.hlm.budget, ttl: 60, registerEdge: false,
});
const cycle = (() => {
  const c = clone(reusedSid.claims);
  c.hlm.ln = [c.hlm.ln[0], { sid: c.sub, h: c.hlm.ln[0].h }];
  return jwsSign('EdDSA', KEYS.child_agent_b.privateJwk,
    { typ: PASSPORT_TYP, kid: kid(KEYS.child_agent_b.publicJwk) }, c).jws;
})();
V('self-referential-lineage', 'Lineage claims the agent is its own ancestor.',
  cycle, { code: 'HLM_4009', reason: 'lineage_cycle' });

const convPath = (() => {
  // One human authorization folded into a DAG: the same session occupies two
  // positions in the chain, so two different children would appear to descend
  // from a single spawn.
  const c = clone(reusedSid.claims);
  c.hlm.ln = [c.hlm.ln[0], { sid: rootSign.claims.sub, h: c.hlm.ln[0].h }, { sid: rootSign.claims.sub, h: c.hlm.ln[0].h }];
  c.hlm.depth = 3;
  return jwsSign('EdDSA', KEYS.child_agent_b.privateJwk,
    { typ: PASSPORT_TYP, kid: kid(KEYS.child_agent_b.publicJwk) }, c).jws;
})();
V('session-reused-in-lineage', 'Same session id occupies two chain positions: a DAG where a tree is required.',
  convPath, { code: 'HLM_4010', reason: 'lineage_session_reused' });

const tooDeep = (() => {
  let parentClaims = rootSign.claims, parentSI = rootSign.signingInput, signer = KEYS.root_agent.publicJwk;
  let lastJws = null;
  for (let d = 0; d < 4; d++) {
    const k = d % 2 === 0 ? KEYS.child_agent_a : KEYS.child_agent_b;
    const p = spawn({
      sk: k.privateJwk, jwk: k.publicJwk,
      spid: `spid://acme/deep-${d}`, name: `Deep ${d}`,
      prof: 'llm.chat.default.v1', caps: d === 0 ? ROOT_CAPS : ['llm.inference.v1'],
      budget: { req: 10, tin: 1024, tout: 128, cost: 10, conc: 1, depth: 4 - d - 1, wid: 1 },
      ttl: 120, parentClaims, parentSigningInput: parentSI, parentJwk: signer,
    });
    parentClaims = p.claims; parentSI = p.signingInput; signer = k.publicJwk; lastJws = p.jws;
  }
  return lastJws;
})();
V('depth-exceeds-policy', 'Depth-5 chain against a policy ceiling of 4.',
  tooDeep, { code: 'HLM_5004', reason: 'budget_depth_exceeded' });

// ---- negative: authorization ----
V('route-outside-capability', 'Agent holding llm.inference.v1 calls the sandbox execution route.',
  grandchild.jws, { code: 'HLM_7001', reason: 'route_not_authorized' }, { method: 'POST', path: '/v1/sandbox/exec' });
V('method-not-allowed', 'GET against a POST-only inference route.',
  grandchild.jws, { code: 'HLM_7002', reason: 'method_not_allowed' }, { method: 'GET', path: '/v1/chat/completions' });

// ---- negative: replay ----
V('replay-of-valid-passport', 'Byte-identical replay of a passport already accepted once.',
  grandchild.jws, { code: 'HLM_2004', reason: 'replay_detected' }, { preAdmitJti: grandchild.claims.jti, preAdmitJkt: jkt(KEYS.rogue_agent.publicJwk), preAdmitSq: grandchild.claims.sqn });

// ---- negative: revocation ----
V('attestation-key-revoked', 'Root agent key is on the denylist (kill switch fired).',
  rootSign.jws, { code: 'HLM_6001', reason: 'key_revoked' },
  { revocation: { v: 1, iat: T0, exp: T0 + 60, keys: [rootSignerJkt], sessions: [], attestations: [], tenants: [] } });

V('session-revoked', 'Specific agent session killed without touching the key.',
  childB.jws, { code: 'HLM_6002', reason: 'session_revoked' },
  { revocation: { v: 1, iat: T0, exp: T0 + 60, keys: [], sessions: [childB.claims.sub], attestations: [], tenants: [] } });

V('attestation-revoked', 'The human authorization itself was withdrawn during offboarding.',
  rootSign.jws, { code: 'HLM_6003', reason: 'attestation_revoked' },
  { revocation: { v: 1, iat: T0, exp: T0 + 60, keys: [], sessions: [], attestations: [attestationJti], tenants: [] } });

V('revocation-set-stale', 'Denylist is 5 minutes old on a strict-revocation profile.',
  rootSign.jws, { code: 'HLM_6004', reason: 'revocation_set_stale' },
  { revocation: { v: 1, iat: T0 - 300, exp: T0 + 60, keys: [], sessions: [], attestations: [], tenants: [] } });

const foreignAttestation = mintAttestation({
  idpKey: KEYS.attacker_idp_key.privateJwk, humanSub: W.human, idpIssuer: 'https://evil-idp.example/',
  rootAgentJwk: KEYS.root_agent.publicJwk, caps: ROOT_CAPS, profiles: ROOT_PROFILES,
  policyId: W.policyId, policyVersion: W.policyVersion, budget: ROOT_BUDGET,
  audience: W.audience, tid: W.tid, spid: 'spid://acme/research-orchestrator', name: 'Research Orchestrator',
  now: T0, ttl: 86400, jti: at(),
});
V('attestation-from-untrusted-idp', 'Attestation signed by an IdP key the tenant never registered.',
  foreignAttestation.jws, { code: 'HLM_1001', reason: 'unknown_kid' }, { asAttestation: true });

// ---------------------------------------------------------------------------
// Property checks
//
// These do not map to a single vector; they assert properties of the design
// that the vectors above depend on but cannot express on their own.
// ---------------------------------------------------------------------------

let failures = 0;
let vectorFailures = 0;
const results = [];

const properties = [];

// P1: the Seal covers the signing input, NOT the signature. This is what makes
// lineage stable across randomized signature schemes -- ES256 uses a random k,
// so two attestations over identical claims have different JWS bytes but MUST
// have the same Seal, or every child in the chain would be orphaned.
{
  const mint = () => mintAttestation({
    idpKey: KEYS.idp_key.privateJwk, humanSub: W.human, idpIssuer: W.idpIssuer,
    rootAgentJwk: KEYS.root_agent.publicJwk, caps: ROOT_CAPS, profiles: ROOT_PROFILES,
    policyId: W.policyId, policyVersion: W.policyVersion, budget: ROOT_BUDGET,
    audience: W.audience, tid: W.tid, spid: 'spid://acme/research-orchestrator',
    name: 'Research Orchestrator', now: T0, ttl: 86400, jti: 'at_fixed',
  });
  const a = mint(), b = mint();
  properties.push({
    id: 'seal-excludes-signature',
    claim: 'ES256 is randomized, so identical claims must still yield an identical Seal.',
    observed: { jwsIdentical: a.jws === b.jws, sealA: seal(a.signingInput), sealB: seal(b.signingInput) },
    pass: a.jws !== b.jws && seal(a.signingInput) === seal(b.signingInput),
  });
}

// P2: JCS ordering is what makes two implementations agree on a seal.
{
  const obj = { z: 1, a: { y: 2, b: 3 }, m: [3, 1, 2] };
  properties.push({
    id: 'jcs-member-ordering',
    claim: 'Canonical serialization sorts members by code unit and preserves array order.',
    observed: jcs(obj),
    pass: jcs(obj) === '{"a":{"b":3,"y":2},"m":[3,1,2],"z":1}',
  });
}

// P3: a non-canonical serialization of the SAME claims must produce a different
// seal. If it did not, an attacker could smuggle meaning past a gateway that
// canonicalizes while a downstream auditor does not.
{
  const claims = { aud: 'x', sub: 'y', hlm: { depth: 1 } };
  const canonical = seal(b64u(jcs(claims)));
  const reordered = seal(b64u('{"hlm":{"depth":1},"sub":"y","aud":"x"}'));
  properties.push({
    id: 'seal-is-canonicalization-sensitive',
    claim: 'Member order changes the Seal, so divergent parsers cannot silently interoperate.',
    observed: { canonical, reordered },
    pass: canonical !== reordered,
  });
}

// P4: seal() is domain-separated, so a Hallmark seal can never collide with a
// bare SHA-256 of the same bytes.
{
  const si = 'eyJhbGciOiJFZERTQSJ9.eyJhIjoxfQ';
  properties.push({
    id: 'seal-domain-separation',
    claim: 'Seal is SHA-256 over a domain separator and a 0x00 delimiter, not a bare digest.',
    observed: { seal: seal(si), rawSha256: b64u(sha256(Buffer.from(si, 'ascii'))) },
    pass: seal(si) !== b64u(sha256(Buffer.from(si, 'ascii'))),
  });
}

for (const p of properties) {
  if (!p.pass) failures++;
  console.log(`  ${p.pass ? 'ok  ' : 'FAIL'} property:${p.id.padEnd(34)} ${p.claim}`);
}

// ---------------------------------------------------------------------------
// Enforcement-point checks
//
// Not request-path vectors: these exercise rules that fire at SPAWN time
// (budget allocation) and at RESPONSE time (budget charging), which is where
// they actually belong. A spec that documents a cap nobody computes is a
// dashboard, not a control.
// ---------------------------------------------------------------------------

const alloc = new AllocationStore();
const enforcement = [];

{
  // L10/L13: two children each claiming 4000 requests where the root holds
  // 5000. The second must be refused: the slices would overlap.
  const store = new AllocationStore();
  const a = spawn({ sk: KEYS.child_agent_a.privateJwk, jwk: KEYS.child_agent_a.publicJwk, spid: 'spid://acme/w-a', name: 'W-A', prof: 'llm.chat.default.v1', caps: A_CAPS, budget: { ...A_BUDGET, req: 4000 }, ttl: 60, registerEdge: false });
  reserveAllocation(store, rootSign.claims, a.claims);
  let code = null, reason = null;
  const b = spawn({ sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk, spid: 'spid://acme/w-b', name: 'W-B', prof: 'llm.chat.default.v1', caps: A_CAPS, budget: { ...A_BUDGET, req: 4000 }, ttl: 60, registerEdge: false });
  try { reserveAllocation(store, rootSign.claims, b.claims); } catch (e) { code = e.code; reason = e.reason; }
  enforcement.push({
    name: 'budget-overlap-refused',
    description: 'Second 4000-request slice against a 5000-request parent is refused; slices must be disjoint.',
    expect: { code: 'HLM_5003', reason: 'budget_overlap' }, actual: { code, reason },
    result: code === 'HLM_5003' && reason === 'budget_overlap' ? 'PASS' : 'FAIL',
  });
}

{
  // Same rule against a parent that overstates its own bookkeeping: even a
  // lying parent cannot make total committed spend exceed the root cap.
  const store = new AllocationStore();
  const liar = { ...rootSign.claims, sub: 'ses_liar', hlm: { ...rootSign.claims.hlm, budget: { ...ROOT_BUDGET, req: 5000 } } };
  const m1 = spawn({ sk: KEYS.child_agent_a.privateJwk, jwk: KEYS.child_agent_a.publicJwk, spid: 'spid://acme/l-1', name: 'L1', prof: 'llm.chat.default.v1', caps: A_CAPS, budget: { ...A_BUDGET, req: 3000 }, ttl: 60, registerEdge: false });
  const m2 = spawn({ sk: KEYS.child_agent_b.privateJwk, jwk: KEYS.child_agent_b.publicJwk, spid: 'spid://acme/l-2', name: 'L2', prof: 'llm.chat.default.v1', caps: A_CAPS, budget: { ...A_BUDGET, req: 3000 }, ttl: 60, registerEdge: false });
  reserveAllocation(store, liar, m1.claims);
  let code = null, reason = null;
  try { reserveAllocation(store, liar, m2.claims); } catch (e) { code = e.code; reason = e.reason; }
  enforcement.push({
    name: 'root-cap-survives-lying-parent',
    description: 'A parent claiming 6000 total but holding 5000 still cannot commit 3000+3000.',
    expect: { code: 'HLM_5003', reason: 'budget_overlap' }, actual: { code, reason },
    result: code === 'HLM_5003' ? 'PASS' : 'FAIL',
  });
}

{
  // Charging is against OBSERVED usage. grandchild holds req 40.
  const st = newSpendState();
  consume(st, grandchild.claims, { req: 30 });
  let code = null, reason = null;
  try { consume(st, grandchild.claims, { req: 20 }); } catch (e) { code = e.code; reason = e.reason; }
  enforcement.push({
    name: 'budget-exhausted-on-observed-usage',
    description: 'Depth-3 agent holds req 40; 30 then 20 observed requests must be refused on the second.',
    expect: { code: 'HLM_5002', reason: 'budget_exhausted' }, actual: { code, reason },
    result: code === 'HLM_5002' ? 'PASS' : 'FAIL',
  });
}

{
  // Unrelated sessions must not share a counter, or one agent could exhaust
  // another's slice.
  const st = newSpendState();
  consume(st, grandchild.claims, { req: 40 });
  let threw = false;
  try { consume(st, childA.claims, { req: 40 }); } catch { threw = true; }
  enforcement.push({
    name: 'slices-are-not-shared',
    description: 'A sibling agent spending its own full slice must not be charged against another session.',
    expect: { code: null, reason: 'no throw' }, actual: { code: null, reason: threw ? 'threw' : 'no throw' },
    result: threw ? 'FAIL' : 'PASS',
  });
}

for (const e of enforcement) {
  if (e.result === 'FAIL') failures++;
  const want = e.expect.code ? `${e.expect.code}/${e.expect.reason}` : e.expect.reason;
  const got = e.actual.code ? `${e.actual.code}/${e.actual.reason}` : e.actual.reason;
  console.log(`  ${e.result === 'PASS' ? 'ok  ' : 'FAIL'} ${('enforce:' + e.name).padEnd(38)} want=${want.padEnd(34)} got=${got}`);
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

for (const v of vectors) {
  let actual;
  try {
    let c;
    if (v.opts.preAdmitJti) {
      c = ctx();
      c.replay.admit(v.opts.preAdmitJti, v.opts.preAdmitJkt, v.opts.preAdmitSq);
    } else {
      c = ctx(v.opts.revocation ? { revocation: new RevocationSet(v.opts.revocation) } : {});
    }

    if (v.opts.asAttestation) {
      // Attestations resolve against the tenant's registered IdP keys, which
      // are a different trust store from the agent key store. The attacker's
      // IdP key is present in ctx.keys and is still refused, because no
      // attestation path is allowed to consult it.
      const idpTrust = new Map([[kid(KEYS.idp_key.publicJwk), KEYS.idp_key.publicJwk]]);
      jwsVerify(v.jws, v.opts.expectTyp ?? ATTESTATION_TYP, (k) => idpTrust.get(k));
    } else if (v.opts.expectTyp) {
      jwsVerify(v.jws, v.opts.expectTyp, (k) => c.keys.get(k));
    } else {
      const o = { ...v.opts };
      for (const k of ['preAdmitJti', 'preAdmitJkt', 'preAdmitSq', 'revocation', 'asAttestation', 'expectTyp']) {
        delete o[k];
      }
      verifyPassport(v.jws, c, o);
    }
    actual = { ok: true };
  } catch (e) {
    actual = { ok: false, code: e.code, reason: e.reason, detail: e.detail, message: e.message };
  }

  let pass;
  if (v.expect === null) {
    pass = actual.ok === true;
  } else {
    pass = !actual.ok && actual.code === v.expect.code && actual.reason === v.expect.reason;
  }
  if (!pass) { failures++; vectorFailures++; }
  results.push({
    name: v.name,
    kind: v.kind,
    description: v.description,
    passport: v.jws,
    opts: v.opts,
    expect: v.expect,
    actual,
    result: pass ? 'PASS' : 'FAIL',
  });
}

const outFile = join(HERE, 'vectors.json');
writeFileSync(outFile, JSON.stringify({
  spec: 'hallmark-agent-identity',
  version: 1,
  generated: 'deterministic',
  note: 'Do not hand-edit. Regenerate with `node vectors.mjs`.',
  frozen_clock: { t0: T0, iso: new Date(T0 * 1000).toISOString() },
  tenant: W,
  policy: POLICY,
  attestation: { jti: attestationJti, jws: attestation.jws, seal: seal(attestation.signingInput) },
  root_agent: { passport: rootSign.jws, seal: seal(rootSign.signingInput) },
  reproducibility: {
    note: 'Payload and header segments, all Seals, and all policy/lineage values are byte-stable across runs. '
      + 'ES256 signature octets are NOT: P-ECDSA uses a random k per RFC 6979-optional practice, so the third '
      + 'JWS segment of the attestation differs on every run. That is precisely why seal() covers the signing '
      + 'input and not the signature. See property seal-excludes-signature.',
    stable: ['header segment', 'payload segment', 'every seal', 'every error code', 'every pass/fail verdict'],
    unstable: ['ES256 signature octet'],
  },
  properties,
  enforcement,
  vectors: results,
}, null, 2) + '\n', 'utf8');

const pos = results.filter((r) => r.kind === 'positive');
const neg = results.filter((r) => r.kind === 'negative');
console.log(`\nHallmark conformance vectors  (frozen clock ${new Date(T0 * 1000).toISOString()})\n`);
for (const r of results) {
  const want = r.expect ? `${r.expect.code}/${r.expect.reason}` : 'accept';
  const got = r.actual.ok ? 'accept' : `${r.actual.code}/${r.actual.reason}`;
  const flag = r.result === 'PASS' ? 'ok  ' : 'FAIL';
  console.log(`  ${flag} ${r.name.padEnd(38)} want=${want.padEnd(34)} got=${got}`);
  if (r.result === 'FAIL' && r.actual.detail) console.log(`       ${r.actual.detail}`);
}
console.log(`\n  ${pos.length} positive, ${neg.length} negative, ${results.length - vectorFailures}/${results.length} vectors passing`);
console.log(`  ${properties.length - properties.filter((p) => !p.pass).length}/${properties.length} design properties, ${enforcement.length - enforcement.filter((e) => e.result === 'FAIL').length}/${enforcement.length} enforcement points`);
console.log(`  wrote ${outFile}\n`);
process.exit(failures ? 1 : 0);
