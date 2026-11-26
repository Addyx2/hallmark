// @pascaal/freeroam — observe-only Hallmark attribution for Node providers.
//
// Draft product middleware, not a full Hallmark L2 conformance gateway.
// It verifies the presented passport's signature, type, basic claim shape,
// time window, audience and tenant. It does NOT walk lineage, resolve a spawn
// edge registry, enforce a signed provider policy, or make an authorization
// decision. Freeroam never denies a request.

import {
  jwsVerify, seal, kid, HallmarkError, BUDGET_FIELDS,
} from '@pascaal/hallmark';

export const PASSPORT_TYP = 'hallmark+agent-passport';
export const MAX_PASSPORT_BYTES = 4096;
export const DEFAULT_MAX_TTL_SEC = 120;
export const HARD_MAX_TTL_SEC = 300;

/** Normalize any thrown value to a pinned Hallmark error. */
export function toHallmarkError(err) {
  if (err instanceof HallmarkError) return err;
  return new HallmarkError('HLM_1005', 'malformed', String(err && err.message || err));
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return undefined;
}

function singleHeader(raw, label) {
  if (Array.isArray(raw)) {
    if (raw.length !== 1) {
      HallmarkError.fail('HLM_1005', 'malformed', `${label} must appear exactly once`);
    }
    return String(raw[0]);
  }
  return String(raw);
}

/**
 * Extract a compact Hallmark passport from request headers.
 *
 * Accepts `Authorization: Hallmark <jws>` (§12.1) and the non-HTTP
 * `X-Hallmark-Passport` / `X-Hallmark-JWS` form (§12.2). A non-Hallmark
 * Authorization scheme is ignored in observe mode; Barricade will reject it
 * on a gated surface.
 */
export function extractPassport(headers = {}) {
  const auth = headerValue(headers, 'authorization');
  const direct = headerValue(headers, 'x-hallmark-passport')
    ?? headerValue(headers, 'x-hallmark-jws');

  if (auth !== undefined && direct !== undefined) {
    HallmarkError.fail('HLM_1005', 'malformed', 'multiple Hallmark credential headers');
  }

  if (auth !== undefined) {
    const value = singleHeader(auth, 'authorization').trim();
    const match = /^Hallmark\s+(\S+)\s*$/i.exec(value);
    if (!match) return { present: false, source: 'authorization', ignored: true };
    return { present: true, jws: match[1], source: 'authorization' };
  }

  if (direct !== undefined) {
    const value = singleHeader(direct, 'x-hallmark-passport').trim();
    if (!value) HallmarkError.fail('HLM_1005', 'malformed', 'empty Hallmark header');
    return { present: true, jws: value, source: 'header' };
  }

  return { present: false, source: null, ignored: false };
}

/**
 * Build a local-only key resolver. No URL-based key discovery is possible.
 * Private key material is refused: a verifier must never hold signing keys.
 */
export function createKeyResolver(keys) {
  if (typeof keys === 'function') return keys;
  if (!keys || typeof keys !== 'object') {
    HallmarkError.fail('HLM_1005', 'malformed', 'keys must be a resolver, map, array or JWK set');
  }

  const byKid = new Map();
  const add = (jwk, explicitKid) => {
    if (!jwk || typeof jwk !== 'object') {
      HallmarkError.fail('HLM_1005', 'malformed', 'key entry is not a JWK object');
    }
    if ('d' in jwk) {
      HallmarkError.fail('HLM_1005', 'malformed', 'private key material must not be installed in a verifier');
    }
    byKid.set(explicitKid ?? kid(jwk), jwk);
  };

  if (keys instanceof Map) {
    for (const [k, jwk] of keys) add(jwk, k);
  } else if (Array.isArray(keys)) {
    for (const jwk of keys) add(jwk);
  } else if (Array.isArray(keys.keys)) {
    for (const jwk of keys.keys) add(jwk);
  } else {
    for (const jwk of Object.values(keys)) add(jwk);
  }

  return (requestedKid) => byKid.get(requestedKid);
}

export function methodOf(req) {
  return String(req && req.method || 'GET').toUpperCase();
}

export function pathOf(req) {
  if (req && typeof req.path === 'string') return req.path;
  const url = req && typeof req.url === 'string' ? req.url : '/';
  const path = url.split('?')[0];
  return path && path.startsWith('/') ? path : '/';
}

/**
 * Build an audit-safe event. `azp`, `ln` and `cnf` are deliberately never
 * included: §7.2 requires those to be redacted from request logs.
 */
export function safeSummary(verified, meta = {}) {
  const claims = verified && verified.claims || {};
  const hlm = claims.hlm || {};
  const event = {
    ts: meta.now ?? Date.now(),
    event: meta.event || 'passport.observed',
  };
  if (meta.code) event.code = meta.code;
  if (meta.reason) event.reason = meta.reason;
  if (meta.tid || hlm.tid) event.tid = meta.tid || hlm.tid;
  if (meta.session || claims.sub) event.session = meta.session || claims.sub;
  if (hlm.depth !== undefined) event.depth = hlm.depth;
  if (hlm.spid) event.spid = hlm.spid;
  if (hlm.root && hlm.root.at) event.attestation = hlm.root.at;
  if (verified && verified.keyThumbprint) event.key = verified.keyThumbprint;
  if (meta.key) event.key = meta.key;
  if (verified && verified.seal) event.seal = verified.seal;
  if (meta.method) event.method = meta.method;
  if (meta.path) event.path = meta.path;
  return event;
}

/**
 * Verify a passport for the provider harness.
 *
 * Scope: JWS verification (V1/V2), claim shape, TTL/time window, audience,
 * tenant, and the structural depth check L1. This is deliberately NOT the
 * full §16 sequence: lineage, attestation registry, PoP, revocation and route
 * authorization belong to a conforming gateway or to Barricade.
 */
export function verifyPassport(jws, options = {}) {
  const resolveKey = options.resolveKey;
  if (typeof resolveKey !== 'function') {
    HallmarkError.fail('HLM_1005', 'malformed', 'resolveKey is required');
  }
  if (typeof jws !== 'string' || Buffer.byteLength(jws, 'ascii') > MAX_PASSPORT_BYTES) {
    HallmarkError.fail('HLM_1005', 'malformed', `passport exceeds ${MAX_PASSPORT_BYTES} bytes`);
  }

  const verified = jwsVerify(jws, PASSPORT_TYP, resolveKey);
  const claims = verified.payload;
  const hlm = claims.hlm;

  if (!hlm || typeof hlm !== 'object' || hlm.v !== 1) {
    HallmarkError.fail('HLM_1005', 'malformed', 'hlm.v must be 1');
  }
  if (typeof claims.sub !== 'string' || !claims.sub
      || typeof claims.jti !== 'string' || !claims.jti
      || !Number.isSafeInteger(claims.sqn) || claims.sqn < 0) {
    HallmarkError.fail('HLM_1005', 'malformed', 'sub, jti and sqn are invalid');
  }
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.nbf)
      || !Number.isSafeInteger(claims.exp)) {
    HallmarkError.fail('HLM_1005', 'malformed', 'iat, nbf and exp must be safe integers');
  }
  if (!Array.isArray(hlm.caps) || hlm.caps.length === 0
      || !hlm.caps.every((c) => typeof c === 'string')) {
    HallmarkError.fail('HLM_1005', 'malformed', 'hlm.caps must be a non-empty string array');
  }
  if (!hlm.budget || typeof hlm.budget !== 'object'
      || BUDGET_FIELDS.some((f) => !Number.isSafeInteger(hlm.budget[f]) || hlm.budget[f] < 0)) {
    HallmarkError.fail('HLM_1005', 'malformed', 'hlm.budget must contain non-negative safe integers');
  }
  if (!Number.isSafeInteger(hlm.depth) || !Array.isArray(hlm.ln)
      || hlm.depth !== hlm.ln.length || hlm.depth < 1) {
    HallmarkError.fail('HLM_4001', 'lineage_depth_invalid', 'depth must equal ln.length and be >= 1');
  }

  const now = options.now === undefined
    ? Math.floor(Date.now() / 1000)
    : options.now;
  if (!Number.isSafeInteger(now)) {
    HallmarkError.fail('HLM_1005', 'malformed', 'now must be an integer in seconds');
  }
  if (claims.iat > now || claims.nbf > now) {
    HallmarkError.fail('HLM_2002', 'not_yet_valid', 'iat or nbf is in the future');
  }
  if (now >= claims.exp) {
    HallmarkError.fail('HLM_2001', 'expired', `expired at ${claims.exp}`);
  }
  const ttl = claims.exp - claims.iat;
  const maxTtl = Math.min(
    Number.isSafeInteger(options.maxTtlSec) ? options.maxTtlSec : DEFAULT_MAX_TTL_SEC,
    HARD_MAX_TTL_SEC,
  );
  if (ttl > maxTtl) {
    HallmarkError.fail('HLM_2003', 'ttl_exceeds_max', `ttl ${ttl}s > ${maxTtl}s`);
  }

  if (options.audience !== undefined) {
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(options.audience)) {
      HallmarkError.fail('HLM_3001', 'audience_mismatch', `aud does not include ${options.audience}`);
    }
  }
  if (options.tenant !== undefined && hlm.tid !== options.tenant) {
    HallmarkError.fail('HLM_3002', 'tenant_mismatch', `hlm.tid=${String(hlm.tid)}`);
  }

  return {
    ...verified,
    claims,
    seal: seal(verified.signingInput),
  };
}

/**
 * Pure evaluation function. Always returns a passthrough decision because
 * Freeroam observes; it never writes an HTTP response.
 */
export function evaluateFreeroam(req, options = {}) {
  const nowMs = options.nowMs === undefined ? Date.now() : options.nowMs;
  const now = options.now === undefined ? Math.floor(nowMs / 1000) : options.now;
  const meta = {
    now: nowMs,
    method: methodOf(req),
    path: pathOf(req),
    tid: options.tenant,
  };

  let extraction;
  try {
    extraction = extractPassport(req && req.headers);
  } catch (err) {
    const e = toHallmarkError(err);
    return {
      decision: 'passthrough',
      context: { mode: 'observe', ok: false, present: true, code: e.code, reason: e.reason },
      event: safeSummary(null, { ...meta, event: 'passport.rejected', code: e.code, reason: e.reason }),
      error: e,
    };
  }

  if (!extraction.present) {
    return {
      decision: 'passthrough',
      context: { mode: 'observe', ok: false, present: false, ignored: extraction.ignored === true },
      event: safeSummary(null, { ...meta, event: 'passport.absent' }),
    };
  }

  try {
    const verified = verifyPassport(extraction.jws, { ...options, now });
    const context = {
      mode: 'observe',
      ok: true,
      present: true,
      source: extraction.source,
      session: verified.claims.sub,
      depth: verified.claims.hlm.depth,
      spid: verified.claims.hlm.spid,
      attestation: verified.claims.hlm.root && verified.claims.hlm.root.at,
      key: verified.keyThumbprint,
      seal: verified.seal,
    };
    return {
      decision: 'passthrough',
      context,
      event: safeSummary(verified, { ...meta, event: 'passport.observed' }),
      _verified: verified,
    };
  } catch (err) {
    const e = toHallmarkError(err);
    return {
      decision: 'passthrough',
      context: { mode: 'observe', ok: false, present: true, code: e.code, reason: e.reason },
      event: safeSummary(null, { ...meta, event: 'passport.rejected', code: e.code, reason: e.reason }),
      error: e,
    };
  }
}

/** Express / Next.js Pages Router compatible middleware `(req, res, next)`. */
export function freeroam(options = {}) {
  const middleware = (req, res, next) => {
    const result = evaluateFreeroam(req, options);
    if (req) req.hallmark = result.context;
    if (typeof options.onEvent === 'function') options.onEvent(result.event);
    if (typeof next === 'function') next();
    return result.context;
  };
  middleware.evaluate = evaluateFreeroam;
  return middleware;
}

/** Fastify `onRequest` hook. Uses Fastify's reply API, not raw response writes. */
export function fastifyFreeroam(options = {}) {
  const middleware = freeroam(options);
  return async function fastifyHook(request) {
    const req = {
      headers: request.headers,
      method: request.method,
      url: request.url,
      path: request.url.split('?')[0],
    };
    middleware(req, undefined, () => {});
    request.hallmark = req.hallmark;
  };
}

export default freeroam;
