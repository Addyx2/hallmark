// @pascaal/barricade — provider-side Hallmark enforcement for Node.
//
// Draft product middleware, not a full Hallmark L2 conformance gateway.
// Freeroam is observe-only; Barricade adds a denial at a signed surface.
// It walls the first responsible action, never first contact.

import {
  jwsSign, jwsVerify, kid, HallmarkError,
  RevocationSet, ReplayCache, BUDGET_FIELDS,
} from '@pascaal/hallmark';
import {
  extractPassport, verifyPassport, createKeyResolver,
  methodOf, pathOf, safeSummary, toHallmarkError,
} from '@pascaal/freeroam';

export { createKeyResolver } from '@pascaal/freeroam';
export { ReplayCache, RevocationSet, BUDGET_FIELDS } from '@pascaal/hallmark';

export const POLICY_TYP = 'hallmark+barricade-policy';
export const DEFAULT_MAX_STALENESS_SEC = 30;

function isPrefixMatch(path, prefixes) {
  return Array.isArray(prefixes) && prefixes.some((prefix) =>
    typeof prefix === 'string' && (path === prefix || path.startsWith(prefix)));
}

function assertPolicy(policy) {
  if (!policy || typeof policy !== 'object' || policy.v !== 1) {
    HallmarkError.fail('HLM_1005', 'malformed', 'policy.v must be 1');
  }
  if (typeof policy.id !== 'string' || !policy.id) {
    HallmarkError.fail('HLM_1005', 'malformed', 'policy.id is required');
  }
  if (typeof policy.tenant !== 'string' || !policy.tenant) {
    HallmarkError.fail('HLM_1005', 'malformed', 'policy.tenant is required');
  }
  if (typeof policy.audience !== 'string' || !policy.audience) {
    HallmarkError.fail('HLM_1005', 'malformed', 'policy.audience is required');
  }
  if (!policy.capabilities || typeof policy.capabilities !== 'object') {
    HallmarkError.fail('HLM_1005', 'malformed', 'policy.capabilities is required');
  }
  if (!Array.isArray(policy.surfaces) || policy.surfaces.length === 0) {
    HallmarkError.fail('HLM_1005', 'malformed', 'policy.surfaces must be a non-empty array');
  }

  for (const [name, cap] of Object.entries(policy.capabilities)) {
    if (!cap || typeof cap !== 'object'
        || !Array.isArray(cap.methods) || cap.methods.length === 0) {
      HallmarkError.fail('HLM_1005', 'malformed', `capability ${name} is malformed`);
    }
    if (!Array.isArray(cap.pathPrefixes) || cap.pathPrefixes.length === 0) {
      HallmarkError.fail('HLM_1005', 'malformed', `capability ${name} needs pathPrefixes`);
    }
    if (cap.profiles !== undefined && (!Array.isArray(cap.profiles) || !cap.profiles.every((p) => typeof p === 'string'))) {
      HallmarkError.fail('HLM_1005', 'malformed', `capability ${name}.profiles is malformed`);
    }
    if (cap.limits !== undefined) {
      if (typeof cap.limits !== 'object'
          || BUDGET_FIELDS.some((f) => cap.limits[f] !== undefined
            && (!Number.isSafeInteger(cap.limits[f]) || cap.limits[f] < 0))) {
        HallmarkError.fail('HLM_1005', 'malformed', `capability ${name}.limits is malformed`);
      }
    }
  }

  for (const surface of policy.surfaces) {
    if (!surface || typeof surface !== 'object'
        || typeof surface.id !== 'string' || !surface.id
        || !['imprint', 'grant'].includes(surface.gate)
        || ![0, 1, 2].includes(surface.tier)
        || !Array.isArray(surface.methods) || surface.methods.length === 0
        || !Array.isArray(surface.pathPrefixes) || surface.pathPrefixes.length === 0) {
      HallmarkError.fail('HLM_1005', 'malformed', 'a policy surface is malformed');
    }
    if (surface.gate === 'grant'
        && (typeof surface.capability !== 'string'
          || !Object.hasOwn(policy.capabilities, surface.capability))) {
      HallmarkError.fail('HLM_1005', 'malformed', `surface ${surface.id} names an unknown capability`);
    }
    if (surface.revocation !== undefined && !['strict', 'bounded'].includes(surface.revocation)) {
      HallmarkError.fail('HLM_1005', 'malformed', `surface ${surface.id} revocation profile is malformed`);
    }
  }
  return policy;
}

/** Sign a provider policy. The policy shape is a draft product artifact. */
export function signPolicy(privateJwk, policy, alg = 'EdDSA') {
  const { jws } = jwsSign(alg, privateJwk, { typ: POLICY_TYP, kid: kid(privateJwk) }, policy);
  return jws;
}

/** Verify and validate a signed provider policy with a local key resolver. */
export function loadPolicy(jws, resolveKey) {
  const verified = jwsVerify(jws, POLICY_TYP, resolveKey);
  return { ...assertPolicy(verified.payload), jws, keyThumbprint: verified.keyThumbprint };
}

/** Longest-prefix-first surface match; no implicit fallback to a wider surface. */
export function matchSurface(policy, method, path) {
  const candidates = policy.surfaces
    .filter((surface) => surface.methods.includes(method) && isPrefixMatch(path, surface.pathPrefixes));
  candidates.sort((a, b) =>
    Math.max(...b.pathPrefixes.map((p) => p.length)) - Math.max(...a.pathPrefixes.map((p) => p.length)));
  return candidates[0];
}

function authorizeCapability(policy, surface, claims, method, path) {
  const cap = policy.capabilities[surface.capability];
  if (!cap) HallmarkError.fail('HLM_7001', 'capability_unknown', surface.capability);
  if (!claims.hlm.caps.includes(surface.capability)) {
    HallmarkError.fail('HLM_7001', 'capability_unknown', `passport does not hold ${surface.capability}`);
  }
  if (!cap.methods.includes(method)) {
    HallmarkError.fail('HLM_7002', 'method_not_allowed', `${method} not permitted by ${surface.capability}`);
  }
  if (!isPrefixMatch(path, cap.pathPrefixes)) {
    HallmarkError.fail('HLM_7001', 'route_not_authorized', `${method} ${path} not permitted by ${surface.capability}`);
  }
  if (Array.isArray(cap.profiles) && cap.profiles.length > 0
      && (!claims.hlm.prof || !cap.profiles.includes(claims.hlm.prof))) {
    HallmarkError.fail('HLM_7001', 'route_not_authorized', `profile ${String(claims.hlm.prof)} not bound to ${surface.capability}`);
  }
  return cap;
}

function getRevocation(input) {
  if (!input) return undefined;
  if (input instanceof RevocationSet) return input;
  return new RevocationSet(input);
}

function checkRevocation(revocation, surface, verified, now) {
  const profile = surface.revocation || (surface.gate === 'grant' ? 'strict' : 'bounded');
  const failClosed = profile !== 'bounded';
  const claims = verified.claims;

  if (!revocation) {
    if (failClosed) {
      HallmarkError.fail('HLM_6004', 'revocation_set_stale', 'no revocation manifest configured');
    }
    return { ok: false, degraded: true, age: Infinity, profile };
  }

  const freshness = revocation.checkFreshness(
    now,
    Number.isSafeInteger(surface.maxStalenessSec) ? surface.maxStalenessSec : DEFAULT_MAX_STALENESS_SEC,
    failClosed,
  );
  if (revocation.isKeyRevoked(verified.keyThumbprint)) {
    HallmarkError.fail('HLM_6001', 'key_revoked', verified.keyThumbprint);
  }
  if (revocation.isSessionRevoked(claims.sub)) {
    HallmarkError.fail('HLM_6002', 'session_revoked', claims.sub);
  }
  if (revocation.isAttestationRevoked(claims.hlm.root && claims.hlm.root.at)) {
    HallmarkError.fail('HLM_6003', 'attestation_revoked', String(claims.hlm.root && claims.hlm.root.at));
  }
  if (revocation.isTenantRevoked(claims.hlm.tid)) {
    HallmarkError.fail('HLM_6003', 'attestation_revoked', `tenant ${claims.hlm.tid} revoked`);
  }
  return { ...freshness, profile };
}

/**
 * In-memory budget ledger keyed by grant `jti`.
 *
 * This is a rebuildable cache, not a source of truth. Pre-flight checks use the
 * slice in the passport; `charge()` subtracts observed usage on response finish
 * (spec §9.2). Idempotency keys prevent a retry from double-charging.
 */
export class BudgetLedger {
  constructor() {
    this.byJti = new Map();
    this.charged = new Set();
  }

  initialize(jti, budget) {
    if (!this.byJti.has(jti)) {
      this.byJti.set(jti, { remaining: { ...budget } });
    }
    return this.byJti.get(jti);
  }

  remaining(jti) {
    return { ...(this.byJti.get(jti)?.remaining ?? {}) };
  }

  charge(jti, idempotencyKey, usage = {}) {
    const entry = this.byJti.get(jti);
    if (!entry) return false;
    const key = `${jti}:${idempotencyKey || 'once'}`;
    if (this.charged.has(key)) return false;
    this.charged.add(key);
    for (const field of BUDGET_FIELDS) {
      const amount = usage[field];
      if (!Number.isSafeInteger(amount) || amount < 0) continue;
      entry.remaining[field] = Math.max(0, (entry.remaining[field] ?? 0) - amount);
    }
    return true;
  }
}

function checkBudget(remaining, cap, claims) {
  for (const field of BUDGET_FIELDS) {
    const ceiling = cap.limits && cap.limits[field];
    if (ceiling !== undefined && (claims.hlm.budget[field] ?? 0) > ceiling) {
      HallmarkError.fail('HLM_5001', 'budget_inflated', `${field} slice exceeds route cap`);
    }
  }
  if ((remaining.req ?? 0) <= 0) {
    HallmarkError.fail('HLM_5002', 'budget_exhausted', 'req budget exhausted');
  }
  if (cap.limits && cap.limits.cost !== undefined && (remaining.cost ?? 0) <= 0) {
    HallmarkError.fail('HLM_5002', 'budget_exhausted', 'cost budget exhausted');
  }
}

function denial(surface, err, meta) {
  const e = toHallmarkError(err);
  const event = safeSummary(null, {
    ...meta,
    event: 'passport.rejected',
    code: e.code,
    reason: e.reason,
  });
  if (surface) {
    event.surface = surface.id;
    event.gate = surface.gate;
    event.tier = surface.tier;
    if (surface.capability) event.capability = surface.capability;
  }
  return {
    decision: 'deny',
    context: {
      mode: 'enforce',
      ok: false,
      gated: true,
      present: false,
      code: e.code,
      reason: e.reason,
      surface: surface && surface.id,
    },
    event,
    error: e,
  };
}

/**
 * Pure enforcement evaluation. Returns one of:
 *   passthrough — no signed surface matches this method + path;
 *   allow       — a passport satisfied the matched surface;
 *   deny        — a HallmarkError with a pinned HLM_ code and HTTP status.
 */
export function evaluateBarricade(req, options = {}) {
  const nowMs = options.nowMs === undefined ? Date.now() : options.nowMs;
  const now = options.now === undefined ? Math.floor(nowMs / 1000) : options.now;
  const meta = { now: nowMs, method: methodOf(req), path: pathOf(req), tid: options.tenant };
  let surface;

  try {
    const policy = assertPolicy(options.policy);
    surface = matchSurface(policy, meta.method, meta.path);
    if (!surface) {
      return {
        decision: 'passthrough',
        context: { mode: 'enforce', ok: true, gated: false, present: false },
        event: null,
      };
    }
    meta.tid = meta.tid || policy.tenant;

    const extraction = extractPassport(req && req.headers);
    if (!extraction.present) {
      HallmarkError.fail('HLM_1005', 'malformed', 'missing Hallmark passport on gated surface');
    }

    const resolveKey = options.resolveKey || createKeyResolver(options.keys);
    const verified = verifyPassport(extraction.jws, {
      resolveKey,
      audience: options.audience ?? policy.audience,
      tenant: options.tenant ?? policy.tenant,
      now,
      maxTtlSec: options.maxTtlSec,
    });
    const claims = verified.claims;

    const revocation = checkRevocation(
      getRevocation(options.revocation), surface, verified, now,
    );

    const replay = options.replay || new ReplayCache();
    if (!replay.admit(claims.jti, verified.keyThumbprint, claims.sqn)) {
      HallmarkError.fail('HLM_2004', 'replay_detected', `jti=${claims.jti}`);
    }

    let cap;
    let ledger;
    if (surface.gate === 'grant') {
      cap = authorizeCapability(policy, surface, claims, meta.method, meta.path);
      ledger = options.ledger || new BudgetLedger();
      ledger.initialize(claims.jti, claims.hlm.budget);
      checkBudget(ledger.remaining(claims.jti), cap, claims);
    }

    const context = {
      mode: 'enforce',
      ok: true,
      gated: true,
      present: true,
      source: extraction.source,
      surface: surface.id,
      capability: surface.capability,
      gate: surface.gate,
      tier: surface.tier,
      session: claims.sub,
      jti: claims.jti,
      sqn: claims.sqn,
      depth: claims.hlm.depth,
      spid: claims.hlm.spid,
      attestation: claims.hlm.root && claims.hlm.root.at,
      key: verified.keyThumbprint,
      seal: verified.seal,
      revocation,
      budget: { ...claims.hlm.budget },
      remaining: ledger ? ledger.remaining(claims.jti) : undefined,
    };

    const event = safeSummary(verified, { ...meta, event: 'passport.accepted' });
    event.surface = surface.id;
    event.gate = surface.gate;
    event.tier = surface.tier;
    if (surface.capability) event.capability = surface.capability;

    return {
      decision: 'allow',
      context,
      event,
      verified,
      surface,
      capability: cap,
      ledger,
      replay,
      revocation,
    };
  } catch (err) {
    return denial(surface, err, meta);
  }
}

/** Attach observed-usage charging to a Node response's `finish` event. */
export function attachUsageCharge(req, res, options = {}) {
  const { ledger, context, onEvent } = options;
  if (!ledger || !context || typeof res?.once !== 'function') return;
  res.once('finish', () => {
    const usage = req && req.hallmarkUsage || { req: 1 };
    const idempotencyKey = req && req.headers && req.headers['idempotency-key']
      || `${context.jti}:${context.sqn}`;
    const charged = ledger.charge(context.jti, idempotencyKey, usage);
    if (charged && typeof onEvent === 'function') {
      onEvent({
        ts: Date.now(),
        event: 'budget.charged',
        session: context.session,
        jti: context.jti,
        surface: context.surface,
        usage,
        remaining: ledger.remaining(context.jti),
      });
    }
  });
}

/** Express / Next.js Pages Router compatible middleware `(req, res, next)`. */
export function barricade(options = {}) {
  const { onEvent } = options;
  const middleware = (req, res, next) => {
    const result = evaluateBarricade(req, options);
    if (req) req.hallmark = result.context;
    if (result.event && typeof onEvent === 'function') onEvent(result.event);

    if (result.decision === 'deny') {
      const { http, body } = result.error.toHTTP();
      if (res) {
        res.statusCode = http;
        res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
        res.setHeader?.('Cache-Control', 'no-store');
        res.setHeader?.('WWW-Authenticate',
          `Hallmark error="${body.error}", hallmark_error="${body.hallmark_error}"`);
        res.end?.(JSON.stringify(body));
      }
      return;
    }

    if (result.decision === 'allow') {
      attachUsageCharge(req, res, {
        ledger: result.ledger,
        context: result.context,
        onEvent,
      });
    }
    if (typeof next === 'function') next();
    return result.context;
  };
  middleware.evaluate = evaluateBarricade;
  return middleware;
}

/** Fastify `onRequest` hook. Denials use Fastify's reply API. */
export function fastifyBarricade(options = {}) {
  const { onEvent } = options;
  return async function fastifyHook(request, reply) {
    const req = {
      headers: request.headers,
      method: request.method,
      url: request.url,
      path: request.url.split('?')[0],
    };
    const result = evaluateBarricade(req, options);
    request.hallmark = result.context;
    if (result.event && typeof onEvent === 'function') onEvent(result.event);

    if (result.decision === 'deny') {
      const { http, body } = result.error.toHTTP();
      return reply
        .code(http)
        .header('Cache-Control', 'no-store')
        .header('WWW-Authenticate',
          `Hallmark error="${body.error}", hallmark_error="${body.hallmark_error}"`)
        .send(body);
    }

    if (result.decision === 'allow' && result.ledger) {
      request.hallmarkCharge = (usage = { req: 1 }, idempotencyKey) => {
        const key = idempotencyKey || `${result.context.jti}:${result.context.sqn}`;
        const charged = result.ledger.charge(result.context.jti, key, usage);
        if (charged && typeof onEvent === 'function') {
          onEvent({
            ts: Date.now(),
            event: 'budget.charged',
            session: result.context.session,
            jti: result.context.jti,
            surface: result.context.surface,
            usage,
            remaining: result.ledger.remaining(result.context.jti),
          });
        }
        return charged;
      };
    }
  };
}

export default barricade;
