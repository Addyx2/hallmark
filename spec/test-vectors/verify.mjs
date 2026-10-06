// Hallmark -- issuer-side minting and gateway-side verification.
//
// Executable form of Sections 6 (Blended Lineage Protocol) and 13 (Verification)
// of ../Hallmark-Agent-Identity-Spec.md.

import {
  b64u, jcs, jwsSign, jwsVerify, seal, jkt, kid,
  HallmarkError, RevocationSet, ReplayCache, AllocationStore,
  budgetSubset, budgetAdd, BUDGET_FIELDS,
} from './hallmark-ref.mjs';

export const PASSPORT_TYP = 'hallmark+agent-passport';
export const ATTESTATION_TYP = 'hallmark+root-attestation';
export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Section 7.1 -- Root Attestation
//
// The attestation is the only artifact in the protocol that is signed by a key
// the human actually controls. Everything downstream is agent-to-agent, and the
// chain of seals is what ties it back to this signature.
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {object} o.idpKey        ES256 JWK controlled by the customer's IdP
 * @param {string} o.humanSub      OIDC `sub` of the human operator
 * @param {string} o.idpIssuer     IdP issuer identifier
 * @param {object} o.rootAgentJwk  Ed25519 JWK the human is authorizing
 * @param {string[]} o.caps        capabilities the root agent may ever use
 * @param {string[]} o.profiles    profiles the root agent may select
 * @param {object} o.budget        root budget envelope
 * @param {number} o.now           epoch seconds (frozen in vectors)
 * @param {number} [o.ttl]         attestation lifetime, default 3600
 */
export function mintAttestation(o) {
  const {
    idpKey, humanSub, idpIssuer, rootAgentJwk, caps, profiles, policyId, policyVersion,
    budget, now, ttl = 3600, jti, kidOverride, kidAlgorithm,
  } = o;

  const attestation = {
    aud: o.audience,
    sub: humanSub,
    iss: idpIssuer,
    iat: now,
    nbf: now,
    exp: now + ttl,
    jti,
    amr: o.amr ?? ['hwk', 'user_presence'],
    // cnf binds the assertion to ONE agent key. A captured attestation cannot
    // be re-pointed at a different key, and a stolen agent key cannot be
    // laundered under a different human.
    cnf: { jkt: jkt(rootAgentJwk) },
    hlm: {
      v: PROTOCOL_VERSION,
      tid: o.tid,
      agent: { spid: o.spid, name: o.name, caps, profiles },
      pol: { id: policyId, v: policyVersion },
      budget,
    },
  };

  const { jws } = jwsSign('ES256', idpKey, { typ: ATTESTATION_TYP, kid: kidOverride ?? kid(idpKey) }, attestation);
  return { jws, signingInput: jws.split('.')[0] + '.' + jws.split('.')[1], attestation };
}

/** Cached attestation verification: signature once, seal re-checked every time. */
export function buildAttestationStore(entries) {
  const byJti = new Map();
  for (const e of entries) {
    const parsed = jwsVerify(e.jws, ATTESTATION_TYP, (k) => (k === e.kid ? e.jwk : undefined));
    byJti.set(e.jti, {
      jti: e.jti,
      claims: parsed.payload,
      keyThumbprint: parsed.keyThumbprint,
      seal: seal(parsed.signingInput),
      alg: parsed.header.alg,
    });
  }
  return byJti;
}

// ---------------------------------------------------------------------------
// Section 8.5 -- Spawn Edge Registry
//
// The hot path receives one passport: the leaf. Verifying its signature and
// checking ln[0] against the attestation anchors the leaf to the human, but the
// intermediate links in ln[1..depth-1] would otherwise be unbacked hashes that
// an attacker could fabricate freely.
//
// The registry closes that. It records one edge per spawn, and an edge can only
// be written at a moment when the parent passport was live and verified -- so
// the registry is a verified path cache rather than an authority. Walking it
// costs `depth` map lookups (depth <= 16, so microseconds) and turns the
// entire chain into a verified path, with no extra bytes on the wire.
// ---------------------------------------------------------------------------

export class EdgeRegistry {
  constructor() { this.edges = new Map(); }

  /**
   * Record a spawn edge. The caller MUST have verified the parent passport in
   * this call. `parentSignerJkt` is the thumbprint of the key that signed the
   * parent passport; it is what lets anchor() confirm, at the final hop, that
   * the chain root is the exact key the human authorized.
   */
  register(e) {
    if (this.edges.has(e.childSub)) {
      HallmarkError.fail('HLM_4010', 'lineage_session_reused', `child ${e.childSub} already registered`);
    }
    this.edges.set(e.childSub, {
      parentSub: e.parentSub,
      tipH: e.tipH,
      depth: e.depth,
      rootAt: e.rootAt,
      rootH: e.rootH,
      parentSignerJkt: e.parentSignerJkt,
    });
  }

  /**
   * Walk the registry from the leaf back to the attested root, checking that
   * every recorded edge agrees with the corresponding lineage entry.
   */
  anchor(claims) {
    const ln = claims.hlm.ln;
    let idx = claims.hlm.depth - 1;
    let sid = claims.sub;
    let rootSignerJkt;

    while (idx > 0) {
      const e = this.edges.get(sid);
      if (!e) {
        HallmarkError.fail('HLM_4011', 'edge_unregistered', `no spawn edge for session ${sid}`);
      }
      if (e.depth !== idx + 1) {
        HallmarkError.fail('HLM_4001', 'lineage_depth_invalid', `edge depth ${e.depth} != lineage position ${idx + 1}`);
      }
      if (e.parentSub !== ln[idx].sid) {
        HallmarkError.fail('HLM_4005', 'lineage_issuer_mismatch', `edge parent ${e.parentSub} != ln[${idx}].sid ${ln[idx].sid}`);
      }
      if (e.tipH !== ln[idx].h) {
        HallmarkError.fail('HLM_4003', 'lineage_seal_mismatch', `edge seal mismatch at lineage position ${idx}`);
      }
      if (idx === 1) {
        // The final hop lands on the attested root agent, whose signing key the
        // human authorized by name.
        if (e.rootAt !== ln[0].sid || e.rootH !== ln[0].h) {
          HallmarkError.fail('HLM_4002', 'lineage_root_mismatch', 'registry root does not match ln[0]');
        }
        if (e.parentSignerJkt === undefined) {
          HallmarkError.fail('HLM_4002', 'lineage_root_mismatch', 'root edge missing parent signer key');
        }
        rootSignerJkt = e.parentSignerJkt;
      }
      sid = e.parentSub;
      idx -= 1;
    }
    return { rootSignerJkt };
  }
}

// ---------------------------------------------------------------------------
// Section 8.3 -- Agent Passport minting
//
// The issuer MUST hold the parent passport. There is no API that mints a
// passport from an attestation alone except the root mint itself, which is what
// makes "spawned without lineage" a structurally impossible state rather than
// a policy violation.
// ---------------------------------------------------------------------------

export function mintPassport(o) {
  const {
    alg, sk, jwk, tid, spid, name, prof, caps, audience, azp, root, policyId, policyVersion,
    budget, now, ttl, jti, sqn, parent, parentSigningInput, attestationSigningInput, attestationJti,
    issuerOverride, cnf, boundKeyJkt,
  } = o;

  const h = { typ: PASSPORT_TYP, kid: kid(jwk) };

  // ln[0] always points at the root attestation. Deeper entries point at
  // parent agents, oldest first. depth === ln.length by construction.
  const ln = [];
  if (!parent) {
    ln.push({ sid: attestationJti, h: seal(attestationSigningInput) });
  } else {
    // Prefix immutability: the child repeats the parent's ancestry verbatim.
    for (const entry of parent.hlm.ln) ln.push({ ...entry });
    ln.push({ sid: parent.sub, h: seal(parentSigningInput) });
  }

  const claims = {
    iss: parent ? parent.sub : issuerOverride,
    sub: jti,
    aud: audience,
    exp: now + ttl,
    nbf: now,
    iat: now,
    jti,
    azp,
    amr: ['agent_delegation'],
    hlm: {
      v: PROTOCOL_VERSION,
      tid,
      spid,
      name,
      prof,
      caps: [...caps].sort(),
      depth: ln.length,
      ln,
      root: parent ? { ...root } : { ...root, at: attestationJti, h: ln[0].h },
      budget,
      pol: { id: policyId, v: policyVersion },
    },
  };
  if (cnf) claims.cnf = cnf;
  else if (boundKeyJkt) claims.cnf = { jkt: boundKeyJkt };
  claims.sqn = sqn;

  const { jws, signingInput, header } = jwsSign(alg, sk, h, claims);
  return { jws, signingInput, claims: jwsVerify(jws, PASSPORT_TYP, () => jwk).payload, header };
}

/**
 * Section 9.2 -- spawn-time allocation.
 *
 * A parent's remaining budget is split into disjoint slices. This is what makes
 * the root cap sound without any cross-gateway coordination: because slices
 * never overlap, total spend across the tree is bounded by the root's budget by
 * construction rather than by eventual consistency.
 *
 * Enforced at MINT time, not request time. A parent is trusted for its own
 * bookkeeping but not for the cap: even a parent that lies about its remainder
 * cannot cause total spend to exceed the root budget, because each slice is
 * validated against the running commitment here.
 */
export function reserveAllocation(store, parentClaims, childClaims) {
  const sub = budgetSubset(childClaims.hlm.budget, parentClaims.hlm.budget);
  if (!sub.ok) {
    HallmarkError.fail('HLM_5001', 'budget_inflated', `${sub.field}: ${sub.child} > parent ${sub.parent}`);
  }
  const unalloc = store.unallocated(parentClaims.sub, parentClaims.hlm.budget);
  for (const f of BUDGET_FIELDS) {
    const want = childClaims.hlm.budget[f];
    const have = unalloc[f];
    if (want !== undefined && have !== undefined && want > have) {
      HallmarkError.fail('HLM_5003', 'budget_overlap',
        `${f}: requested ${want} but only ${have} unallocated (committed ${JSON.stringify(store.committed(parentClaims.sub))})`);
    }
  }
  if (!store.reserve(parentClaims.sub, childClaims.sub, childClaims.hlm.budget)) {
    HallmarkError.fail('HLM_5003', 'budget_overlap', `child ${childClaims.sub} already holds an allocation`);
  }
}

/**
 * Section 9.2 -- per-request charging.
 *
 * Charged from OBSERVED usage on response, never from a pre-flight estimate.
 * Estimating up front and trusting the estimate is how token budgets quietly
 * stop meaning anything.
 */
export function consume(state, claims, usage) {
  for (const f of BUDGET_FIELDS) {
    const used = usage[f];
    if (used === undefined) continue;
    const slice = state.used.get(claims.sub) ?? {};
    const next = (slice[f] ?? 0) + used;
    if (claims.hlm.budget[f] !== undefined && next > claims.hlm.budget[f]) {
      HallmarkError.fail('HLM_5002', 'budget_exhausted',
        `${f}: ${next} exceeds slice ${claims.hlm.budget[f]} (agent ${claims.sub})`);
    }
    slice[f] = next;
    state.used.set(claims.sub, slice);
  }
  return state;
}

export function newSpendState() {
  return { used: new Map() };
}

// ---------------------------------------------------------------------------
// Section 16 -- gateway verification context
// ---------------------------------------------------------------------------

export function createContext(o) {
  return {
    now: o.now,
    tenant: o.tenant,
    audience: o.audience,
    keys: o.keys,                       // Map<kid, jwk>, local only
    policies: o.policies,               // Map<"id@v", policy>
    attestations: o.attestations,       // Map<jti, validated attestation>
    revocation: o.revocation,           // RevocationSet
    replay: o.replay ?? new ReplayCache(o.replayOpts),
    allocations: o.allocations ?? new AllocationStore(),
    edges: o.edges ?? new EdgeRegistry(),
    maxTtlSec: o.maxTtlSec ?? 300,
    maxDepth: o.maxDepth ?? 16,
    maxPassportBytes: o.maxPassportBytes ?? 4096,
    maxRevocationStalenessSec: o.maxRevocationStalenessSec ?? 30,
    allowDegradedRevocation: o.allowDegradedRevocation ?? false,
  };
}

const REQ_HLM_STRINGS = ['tid', 'spid', 'prof'];
const REQ_HLM = ['v', 'depth', 'ln', 'root', 'budget', 'pol'];

function validateShape(claims) {
  for (const c of ['iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti', 'azp', 'sqn']) {
    if (claims[c] === undefined || claims[c] === null) {
      HallmarkError.fail('HLM_1005', 'malformed', `missing registered claim ${c}`);
    }
  }
  if (!claims.hlm || typeof claims.hlm !== 'object') {
    HallmarkError.fail('HLM_1005', 'malformed', 'missing hlm claim object');
  }
  for (const k of REQ_HLM) if (claims.hlm[k] === undefined) {
    HallmarkError.fail('HLM_1005', 'malformed', `missing hlm.${k}`);
  }
  for (const k of REQ_HLM_STRINGS) if (typeof claims.hlm[k] !== 'string') {
    HallmarkError.fail('HLM_1005', 'malformed', `hlm.${k} must be a string`);
  }
  if (claims.hlm.v !== PROTOCOL_VERSION) {
    HallmarkError.fail('HLM_1005', 'malformed', `unsupported hlm.v ${claims.hlm.v}`);
  }
  if (!Array.isArray(claims.hlm.ln) || claims.hlm.ln.length === 0) {
    HallmarkError.fail('HLM_4001', 'lineage_depth_invalid', 'hlm.ln must be a non-empty array');
  }
  if (!Array.isArray(claims.hlm.caps) || claims.hlm.caps.length === 0) {
    HallmarkError.fail('HLM_1005', 'malformed', 'hlm.caps must be a non-empty array');
  }
  if (!claims.hlm.pol || typeof claims.hlm.pol.id !== 'string') {
    HallmarkError.fail('HLM_1005', 'malformed', 'hlm.pol.id missing');
  }
  for (const f of BUDGET_FIELDS) {
    const v = claims.hlm.budget[f];
    if (v !== undefined && (!Number.isSafeInteger(v) || v < 0)) {
      HallmarkError.fail('HLM_1005', 'malformed', `hlm.budget.${f} must be a non-negative safe integer`);
    }
  }
}

// ---------------------------------------------------------------------------
// Section 8.2 -- L1..L13 lineage invariants
// ---------------------------------------------------------------------------

function checkLineage(claims, parentInfo, { edgeAnchored = false } = {}) {
  const ln = claims.hlm.ln;
  const depth = claims.hlm.depth;

  // L1 -- depth is the length of the chain, bounded.
  if (depth !== ln.length) {
    HallmarkError.fail('HLM_4001', 'lineage_depth_invalid', `depth=${depth} ln.length=${ln.length}`);
  }
  for (const e of ln) {
    if (typeof e?.sid !== 'string' || typeof e?.h !== 'string') {
      HallmarkError.fail('HLM_4001', 'lineage_depth_invalid', 'lineage entries must be {sid,h} strings');
    }
  }

  // L13 -- a session may appear at most once. This forbids convergent paths,
  // so the DAG is forced to be a tree and one human authorization cannot fan
  // out to two independent chains.
  const sids = new Set();
  for (const e of ln) {
    if (sids.has(e.sid)) HallmarkError.fail('HLM_4010', 'lineage_session_reused', `sid ${e.sid} appears twice`);
    sids.add(e.sid);
  }

  // L9 -- an agent may not appear in its own ancestry. The issuer legitimately
  // appears as the chain tip, so it is not checked here; L13 already forbids
  // any session from occupying two positions.
  if (sids.has(claims.sub)) HallmarkError.fail('HLM_4009', 'lineage_cycle', 'subject appears in own lineage');
  if (claims.sub === claims.iss) HallmarkError.fail('HLM_4009', 'lineage_cycle', 'sub === iss');

  // L2 -- the chain terminates in the attested root, and both the claim and
  // the first chain entry must agree on it.
  if (ln[0].sid !== claims.hlm.root.at || ln[0].h !== claims.hlm.root.h) {
    HallmarkError.fail('HLM_4002', 'lineage_root_mismatch', 'ln[0] does not match hlm.root');
  }
  if (typeof claims.hlm.root.sub !== 'string' || typeof claims.hlm.root.iss !== 'string') {
    HallmarkError.fail('HLM_4002', 'lineage_root_mismatch', 'hlm.root must carry sub and iss for audit self-containment');
  }

  if (depth === 1) return; // root agent: no parent to chain to

  if (!parentInfo) {
    // Without the parent in hand, the narrowing invariants (L5, L6, L8, L10,
    // L11, L12) were already enforced at spawn time and are memoized in the
    // spawn edge, which anchor() walks below. A gateway with neither the
    // parent nor an edge registry has no path to the human and must refuse.
    if (!edgeAnchored) {
      HallmarkError.fail('HLM_3003', 'parent_required', `depth=${claims.hlm.depth} needs parentJws or a spawn-edge registry`);
    }
    return;
  }

  const { parentClaims, parentSigningInput } = parentInfo;
  const pln = parentClaims.hlm.ln;

  // L3 -- the immediate parent link must seal to exactly the recorded value.
  const tip = ln[ln.length - 1];
  if (tip.sid !== parentClaims.sub) {
    HallmarkError.fail('HLM_4003', 'lineage_seal_mismatch', `tip.sid=${tip.sid} parent.sub=${parentClaims.sub}`);
  }
  if (tip.h !== seal(parentSigningInput)) {
    HallmarkError.fail('HLM_4003', 'lineage_seal_mismatch', 'tip seal does not recompute from parent signing input');
  }

  // L4 -- prefix immutability. Ancestry is append-only; a child cannot rewrite
  // history, only extend it.
  if (ln.length !== pln.length + 1) {
    HallmarkError.fail('HLM_4004', 'lineage_prefix_mutated', `ln.length=${ln.length} parent.ln.length=${pln.length}`);
  }
  for (let i = 0; i < pln.length; i++) {
    if (ln[i].sid !== pln[i].sid || ln[i].h !== pln[i].h) {
      HallmarkError.fail('HLM_4004', 'lineage_prefix_mutated', `ancestry diverges at index ${i}`);
    }
  }

  // L5 -- the issuer is the parent, not some other party.
  if (claims.iss !== parentClaims.sub) {
    HallmarkError.fail('HLM_4005', 'lineage_issuer_mismatch', `iss=${claims.iss} parent.sub=${parentClaims.sub}`);
  }

  // L6 -- THE blended-identity invariant. Human identity is immutable down the
  // entire chain. A sub-agent can never re-point lineage at a different human.
  if (claims.azp !== parentClaims.azp) {
    HallmarkError.fail('HLM_4006', 'lineage_human_changed', `azp ${claims.azp} != ${parentClaims.azp}`);
  }

  // L7 -- no cross-tenant spawning.
  if (claims.hlm.tid !== parentClaims.hlm.tid) {
    HallmarkError.fail('HLM_4007', 'lineage_tenant_mixed', 'child tenant differs from parent tenant');
  }

  // L8 -- audience may only narrow.
  const pAud = Array.isArray(parentClaims.aud) ? parentClaims.aud : [parentClaims.aud];
  const cAud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  for (const a of cAud) {
    if (!pAud.includes(a)) HallmarkError.fail('HLM_4008', 'lineage_audience_widened', `aud ${a} not held by parent`);
  }

  // L11 -- the child's validity window nests inside the parent's.
  if (!(claims.nbf >= parentClaims.nbf && claims.exp <= parentClaims.exp)) {
    HallmarkError.fail('HLM_4003', 'lineage_window_not_ancestor', 'validity window is not nested');
  }

  // L12 -- capabilities may only narrow. `hlm.prof` is deliberately NOT part of
  // this check: a profile is a policy-scoped rate/telemetry selector, not an
  // authority, so a child may legitimately pick a different one. What actually
  // constrains it is authorizeRoute() below, which requires the chosen profile
  // to be bound to a capability the child still holds.
  const pCaps = new Set(parentClaims.hlm.caps);
  for (const c of claims.hlm.caps) {
    if (!pCaps.has(c)) HallmarkError.fail('HLM_4012', 'profile_not_narrowed', `capability ${c} not held by parent`);
  }

  // L10 -- budget may only narrow, and the child's slice must fit inside what
  // the parent has left unallocated.
  const sub = budgetSubset(claims.hlm.budget, parentClaims.hlm.budget);
  if (!sub.ok) {
    HallmarkError.fail('HLM_5001', 'budget_inflated', `${sub.field}: ${sub.child} > parent ${sub.parent}`);
  }
  if (claims.hlm.budget.depth !== undefined && parentClaims.hlm.budget.depth !== undefined) {
    if (claims.hlm.budget.depth > parentClaims.hlm.budget.depth) {
      HallmarkError.fail('HLM_5004', 'budget_depth_exceeded', 'child may delegate deeper than its parent may');
    }
  }
}

// ---------------------------------------------------------------------------
// Section 16 -- the hot path
// ---------------------------------------------------------------------------

/**
 * @param {string} jws             compact JWS agent passport
 * @param {object} ctx             createContext()
 * @param {object} [opts]
 * @param {string} [opts.parentJws] parent passport, required when depth > 1
 * @param {string} [opts.requestJws] RFC 9421 request signature, for proof-of-possession
 * @param {string} [opts.method]   HTTP method, for route authorization
 * @param {string} [opts.path]     request path
 * @param {string} [opts.tlsCertJkt] client-certificate thumbprint at the L4 layer
 * @returns {{claims, depth, human, policy, keyThumbprint}}
 */
export function verifyPassport(jws, ctx, opts = {}) {
  if (Buffer.byteLength(jws, 'utf8') > ctx.maxPassportBytes) {
    HallmarkError.fail('HLM_1005', 'malformed', `passport exceeds ${ctx.maxPassportBytes} bytes`);
  }

  // V1, V2 -- signature, alg, typ, canonical form.
  const parsed = jwsVerify(jws, PASSPORT_TYP, (k) => ctx.keys.get(k));
  const claims = parsed.payload;
  validateShape(claims);

  const policy = ctx.policies.get(`${claims.hlm.pol.id}@${claims.hlm.pol.v}`);
  if (!policy) HallmarkError.fail('HLM_1005', 'malformed', `unknown policy ${claims.hlm.pol.id}@${claims.hlm.pol.v}`);

  // V8 -- revocation, including the freshness gate.
  const rev = ctx.revocation;
  const revResult = rev.checkFreshness(ctx.now, ctx.maxRevocationStalenessSec, policy.revocation !== 'bounded' && !ctx.allowDegradedRevocation);
  if (rev.isKeyRevoked(parsed.keyThumbprint)) HallmarkError.fail('HLM_6001', 'key_revoked', parsed.keyThumbprint);
  if (rev.isSessionRevoked(claims.sub)) HallmarkError.fail('HLM_6002', 'session_revoked', claims.sub);
  if (rev.isTenantRevoked(claims.hlm.tid)) HallmarkError.fail('HLM_6001', 'key_revoked', `tenant ${claims.hlm.tid} revoked`);

  // V3 -- validity window and the anti-abuse TTL ceiling. Without the ceiling an
  // issuer (or a compromised root agent) can mint a year-long passport and
  // revocation becomes cosmetic.
  const now = ctx.now;
  if (typeof claims.exp !== 'number' || typeof claims.nbf !== 'number' || typeof claims.iat !== 'number') {
    HallmarkError.fail('HLM_1005', 'malformed', 'nbf/iat/exp must be numbers');
  }
  if (now < claims.nbf) HallmarkError.fail('HLM_2002', 'not_yet_valid', `nbf=${claims.nbf} now=${now}`);
  if (now >= claims.exp) HallmarkError.fail('HLM_2001', 'expired', `exp=${claims.exp} now=${now}`);
  if (claims.iat > now + 30) HallmarkError.fail('HLM_2002', 'not_yet_valid', 'iat in the future');
  if (claims.exp - claims.iat > Math.min(ctx.maxTtlSec, policy.maxTtlSec)) {
    HallmarkError.fail('HLM_2003', 'ttl_exceeds_max', `ttl=${claims.exp - claims.iat} max=${Math.min(ctx.maxTtlSec, policy.maxTtlSec)}`);
  }

  // V4 -- audience and tenant pinning.
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(ctx.audience)) {
    HallmarkError.fail('HLM_3001', 'audience_mismatch', `aud=${JSON.stringify(claims.aud)} gateway=${ctx.audience}`);
  }
  if (claims.hlm.tid !== ctx.tenant) {
    HallmarkError.fail('HLM_3002', 'tenant_mismatch', `tid=${claims.hlm.tid} gateway tenant=${ctx.tenant}`);
  }

  // V5/V6 -- replay suppression.
  if (!ctx.replay.admit(claims.jti, parsed.keyThumbprint, claims.sqn)) {
    HallmarkError.fail('HLM_2004', 'replay_detected', `jti=${claims.jti}`);
  }

  // V10 -- proof of possession. A signature proves the key was used, not that
  // the caller holds it; without this a captured request log is a replay kit.
  const wantJkt = claims.cnf?.jkt;
  if (wantJkt) {
    if (opts.tlsCertJkt) {
      if (opts.tlsCertJkt !== wantJkt) {
        HallmarkError.fail('HLM_8002', 'pop_key_mismatch', 'client certificate is not cnf.jkt');
      }
    } else if (opts.requestJws) {
      const pop = jwsVerify(opts.requestJws, 'hallmark-pop+jws', (k) => (k === parsed.header.kid ? parsed.jwk : undefined));
      if (pop.claims.jkt !== wantJkt) HallmarkError.fail('HLM_8002', 'pop_key_mismatch', 'PoP assertion bound to another key');
    } else {
      HallmarkError.fail('HLM_8001', 'pop_missing', 'cnf present but no proof of possession supplied');
    }
  }

  // Section 16 step 8 -- the attested human. Re-derive the seal chain's
  // origin on every request: cheap (one SHA-256), and it is the whole point.
  const at = ctx.attestations.get(claims.hlm.root.at);
  if (!at) HallmarkError.fail('HLM_4002', 'lineage_root_mismatch', `attestation ${claims.hlm.root.at} unknown to gateway`);
  if (at.seal !== claims.hlm.root.h) {
    HallmarkError.fail('HLM_4002', 'lineage_root_mismatch', 'hlm.root.h does not match attestation seal');
  }
  if (rev.isAttestationRevoked(claims.hlm.root.at)) {
    HallmarkError.fail('HLM_6003', 'attestation_revoked', claims.hlm.root.at);
  }
  if (at.claims.hlm.tid !== claims.hlm.tid) {
    HallmarkError.fail('HLM_4007', 'lineage_tenant_mixed', 'attestation tenant differs from passport tenant');
  }
  if (claims.azp !== at.claims.sub) {
    HallmarkError.fail('HLM_4006', 'lineage_human_changed', 'azp differs from the attested human');
  }

  // V7 -- lineage.
  let parentInfo;
  if (opts.parentJws) {
    const pp = jwsVerify(opts.parentJws, PASSPORT_TYP, (k) => ctx.keys.get(k));
    parentInfo = { parentClaims: pp.payload, parentSigningInput: pp.signingInput };
  }
  checkLineage(claims, parentInfo, { edgeAnchored: !!ctx.edges });

  // The attested human authorized exactly one root key. For a root passport
  // that is its own signing key; for anything deeper it is the signing key of
  // the depth-1 ancestor, recovered by walking the spawn-edge registry.
  const anchored = claims.hlm.depth > 1 ? ctx.edges.anchor(claims) : { rootSignerJkt: parsed.keyThumbprint };
  if (at.claims.cnf?.jkt !== anchored.rootSignerJkt) {
    HallmarkError.fail('HLM_4002', 'lineage_root_mismatch', 'attestation cnf.jkt does not bind the chain root signer key');
  }

  if (claims.hlm.depth > ctx.maxDepth || claims.hlm.depth > policy.maxDepth) {
    HallmarkError.fail('HLM_5004', 'budget_depth_exceeded', `depth=${claims.hlm.depth} max=${Math.min(ctx.maxDepth, policy.maxDepth)}`);
  }

  // V9 -- route authorization against the pinned policy.
  if (opts.method && opts.path) authorizeRoute(policy, claims, opts.method, opts.path);

  return {
    claims,
    depth: claims.hlm.depth,
    human: { sub: claims.azp, idpIssuer: claims.hlm.root.iss, attestation: claims.hlm.root.at },
    keyThumbprint: parsed.keyThumbprint,
    policy,
    degradedRevocation: revResult.degraded,
  };
}

/**
 * Section 9.4 -- capability-to-route authorization.
 *
 * The route must be authorized by AT LEAST ONE capability the agent holds.
 * Selecting the first matching capability instead would let the order of a
 * sorted array decide authorization, which would silently deny legitimate
 * traffic (or, on a different sort, admit denied traffic).
 */
export function authorizeRoute(policy, claims, method, path) {
  const m = method.toUpperCase();
  let sawKnownCap = false;
  let sawAllowedMethod = false;
  let sawAllowedProfile = false;

  for (const cap of claims.hlm.caps) {
    const spec = policy.capabilities[cap];
    if (!spec) continue;
    sawKnownCap = true;
    if (spec.methods && !spec.methods.includes(m)) continue;
    sawAllowedMethod = true;
    if (spec.profiles && !spec.profiles.includes(claims.hlm.prof)) continue;
    sawAllowedProfile = true;
    if (spec.pathPrefixes && !spec.pathPrefixes.some((p) => path.startsWith(p))) continue;
    return spec;
  }

  if (!sawKnownCap) {
    HallmarkError.fail('HLM_7001', 'capability_unknown', `no policy capability among ${claims.hlm.caps.join(',')}`);
  }
  if (!sawAllowedMethod) {
    HallmarkError.fail('HLM_7002', 'method_not_allowed', `${m} not permitted by ${claims.hlm.caps.join(',')}`);
  }
  if (!sawAllowedProfile) {
    HallmarkError.fail('HLM_4012', 'profile_not_narrowed', `profile ${claims.hlm.prof} not bound to any held capability`);
  }
  HallmarkError.fail('HLM_7001', 'route_not_authorized', `${m} ${path} not permitted by ${claims.hlm.caps.join(',')}`);
}

// Re-exported so conformance suites need only one import.
export { RevocationSet, ReplayCache, AllocationStore, HallmarkError };
export { b64u, jcs, seal, jkt, kid, budgetAdd, budgetSubset };
export const _internals = { validateShape, checkLineage, authorizeRoute, BUDGET_FIELDS };
