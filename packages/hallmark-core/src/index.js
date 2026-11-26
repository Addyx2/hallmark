// Hallmark Agent Identity Protocol -- v1 core primitives.
//
// This module is a semantic copy of spec/test-vectors/hallmark-ref.mjs.
// The normative rules live in spec/Hallmark-Agent-Identity-Spec.md.
// Where prose and code disagree, prose wins and this file is a bug.
//
// Zero dependencies. Node >= 18. No fixture files are required.

import {
  createHash, createPublicKey, createPrivateKey,
  sign as edSign, verify as edVerify,
} from 'node:crypto';

// ---------------------------------------------------------------------------
// Section 6.1 -- base64url, no padding (RFC 4648 §5)
// ---------------------------------------------------------------------------

export function b64u(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(input) {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]*$/.test(input)) {
    throw new HallmarkError('HLM_1005', 'malformed', 'not valid unpadded base64url');
  }
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// ---------------------------------------------------------------------------
// Section 6.2 -- JSON Canonicalization Scheme (RFC 8785), restricted
//
// Hallmark payloads are already constrained to ASCII-safe strings and safe
// integers, so we only need JCS's member-ordering rule. The restrictions are
// asserted, not silently repaired, so a malformed payload fails loudly instead
// of producing a divergent hash.
// ---------------------------------------------------------------------------

const C0_ESCAPES = {
  0x08: '\\b',
  0x09: '\\t',
  0x0a: '\\n',
  0x0c: '\\f',
  0x0d: '\\r',
  0x22: '\\"',
  0x5c: '\\\\',
};

function jcsString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const esc = C0_ESCAPES[code];
    if (esc !== undefined) {
      out += esc;
    } else if (code < 0x20) {
      out += '\\u' + code.toString(16).padStart(4, '0');
    } else {
      out += s[i];
    }
  }
  return out + '"';
}

function jcsNumber(n) {
  if (!Number.isSafeInteger(n)) {
    throw new HallmarkError('HLM_1005', 'malformed', `non-integer number ${n} is not canonicalizable`);
  }
  return String(n);
}

export function jcs(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') return jcsNumber(value);
  if (t === 'string') return jcsString(value);
  if (Array.isArray(value)) return '[' + value.map(jcs).join(',') + ']';
  if (t === 'object') {
    // RFC 8785 §3.2.3: sort by UTF-16 code unit.
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => jcsString(k) + ':' + jcs(value[k])).join(',') + '}';
  }
  throw new HallmarkError('HLM_1005', 'malformed', `type ${t} is not representable in JCS`);
}

// ---------------------------------------------------------------------------
// Section 6.3 -- hash domain separation and the Seal
//
//   seal(v, signing_input) = b64u( SHA-256( DS(v) || 0x00 || signing_input ) )
//
// signing_input is the ASCII bytes of "<b64u(header)>.<b64u(payload)>" -- i.e.
// the JWS Signing Input. The signature is NOT covered, because the child must
// be able to reference its parent before (or without) holding the parent's
// signature. A forged signature therefore yields a distinct seal, which is
// exactly what V2/V3 reject.
// ---------------------------------------------------------------------------

export const SEAL_DS_V1 = 'hallmark.seal.v1';

export function sha256(buf) {
  return createHash('sha256').update(buf).digest();
}

export function seal(signingInput, ds = SEAL_DS_V1) {
  return b64u(sha256(Buffer.concat([Buffer.from(ds, 'utf8'), Buffer.from([0x00]), Buffer.from(signingInput, 'ascii')])));
}

// ---------------------------------------------------------------------------
// Section 6.4 -- key thumbprints (RFC 7638, JWK SHA-256 thumbprint)
//
// Required members only: {crv,kty,x} for OKP, {crv,kty,x,y} for EC.
// ---------------------------------------------------------------------------

export function jkt(jwk) {
  let required;
  if (jwk.kty === 'OKP') required = { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
  else if (jwk.kty === 'EC') required = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
  else throw new HallmarkError('HLM_1005', 'malformed', `no thumbprint profile for kty=${jwk.kty}`);
  return b64u(sha256(Buffer.from(jcs(required), 'utf8')));
}

export function kid(jwk) {
  const t = jkt(jwk);
  return `${jwk.crv === 'Ed25519' ? 'ed25519' : 'p256'}:${t.slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Section 6.1 -- JWS (RFC 7515) restricted to EdDSA and ES256
// ---------------------------------------------------------------------------

// Symmetric and RSA algorithms are rejected outright: an agent that can present
// a shared secret is an agent whose key is extractable by every holder.
export const ALG_ALLOWLIST = Object.freeze(['EdDSA', 'ES256']);

// RFC 7515 header parameters an implementation MUST resolve locally. Fetching
// `jku`/`x5u` turns signature verification into an SSRF primitive.
export const REMOTE_KEY_HEADERS = Object.freeze(['jku', 'x5u', 'x5c']);

export function jwsSign(alg, privateJwk, header, payload) {
  if (!ALG_ALLOWLIST.includes(alg)) throw new HallmarkError('HLM_1002', 'unsupported_alg', alg);
  const h = { ...header, alg };
  const signingInput = `${b64u(jcs(h))}.${b64u(jcs(payload))}`;
  const sk = createPrivateKey({ key: privateJwk, format: 'jwk' });
  let sig;
  if (alg === 'EdDSA') {
    sig = edSign(null, Buffer.from(signingInput, 'ascii'), sk);
  } else {
    // ES256 in JWS is the raw fixed-width r||s pair, not ASN.1 DER.
    sig = edSign('sha256', Buffer.from(signingInput, 'ascii'), { key: sk, dsaEncoding: 'ieee-p1363' });
  }
  return { jws: `${signingInput}.${b64u(sig)}`, signingInput, header: h };
}

export function jwsParse(jws) {
  if (typeof jws !== 'string') throw new HallmarkError('HLM_1005', 'malformed', 'jws not a string');
  const parts = jws.split('.');
  if (parts.length !== 3) throw new HallmarkError('HLM_1005', 'malformed', `expected 3 JWS parts, got ${parts.length}`);
  const [h64, p64, s64] = parts;
  if (!h64 || !p64) throw new HallmarkError('HLM_1005', 'malformed', 'empty JWS header or payload');
  const headerBytes = b64uDecode(h64);
  const payloadBytes = b64uDecode(p64);
  let header, payload;
  try {
    header = JSON.parse(headerBytes.toString('utf8'));
    payload = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    throw new HallmarkError('HLM_1005', 'malformed', 'JWS header/payload is not valid JSON');
  }  if (header === null || typeof header !== 'object' || Array.isArray(header)) {
    throw new HallmarkError('HLM_1005', 'malformed', 'JWS header must be a JSON object');
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HallmarkError('HLM_1005', 'malformed', 'JWS payload must be a JSON object');
  }
  return {
    header, payload, signingInput: `${h64}.${p64}`, signature: b64uDecode(s64),
    headerB64: h64, payloadB64: p64, headerBytes, payloadBytes,
  };
}

/**
 * Strict JSON parser that also reports duplicate object members.
 *
 * JSON.parse silently keeps the last of a repeated member, so `{"a":1,"a":2}`
 * and `{"a":2}` become indistinguishable downstream -- yet they are different
 * bytes and therefore different seals. Any implementation that verifies a
 * signature before canonicalizing will accept one form and reject the other,
 * which is precisely the divergence the seal chain must not have.
 */
export function parseJsonStrict(src) {
  let i = 0;
  let duplicates = [];

  const fail = (msg) => {
    throw new HallmarkError('HLM_1005', 'malformed', `JSON at offset ${i}: ${msg}`);
  };
  const ws = () => {
    while (i < src.length && (src[i] === ' ' || src[i] === '\n' || src[i] === '\r' || src[i] === '\t')) i++;
  };
  const lit = (word, val) => {
    if (src.slice(i, i + word.length) !== word) fail(`expected ${word}`);
    i += word.length;
    return val;
  };
  const str = () => {
    if (src[i] !== '"') fail('expected string');
    i++;
    let out = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '"') { i++; return out; }
      if (c === '\\') {
        i++;
        const e = src[i];
        if (e === 'u') { out += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16)); i += 5; }
        else { out += ({ b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\', '/': '/' })[e] ?? e; i++; }
        continue;
      }
      if (c < ' ') fail('unescaped control character');
      out += c;
      i++;
    }
    fail('unterminated string');
  };
  const num = () => {
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?/.exec(src.slice(i));
    if (!m) fail('expected number');
    i += m[0].length;
    return Number(m[0]);
  };
  const value = () => {
    ws();
    const c = src[i];
    if (c === '{') {
      i++;
      const o = {};
      ws();
      if (src[i] === '}') { i++; return o; }
      for (;;) {
        ws();
        const k = str();
        if (Object.prototype.hasOwnProperty.call(o, k)) duplicates.push(k);
        ws();
        if (src[i] !== ':') fail('expected :');
        i++;
        o[k] = value();
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return o; }
        fail('expected , or }');
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      ws();
      if (src[i] === ']') { i++; return a; }
      for (;;) {
        a.push(value());
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return a; }
        fail('expected , or ]');
      }
    }
    if (c === '"') return str();
    if (c === 't') return lit('true', true);
    if (c === 'f') return lit('false', false);
    if (c === 'n') return lit('null', null);
    return num();
  };

  const v = value();
  ws();
  if (i !== src.length) fail('trailing data');
  return { value: v, duplicates };
}

/**
 * Verify a JWS. Returns the parsed parts. Throws HallmarkError on any failure.
 * `resolve(kid)` MUST return a local JWK or undefined -- it must never perform
 * network I/O.
 */
export function jwsVerify(jws, expectedTyp, resolve) {
  const parts = jwsParse(jws);
  const { payloadBytes, headerBytes } = parts;

  // V1 -- algorithm allowlist, before any crypto runs.
  const alg = parts.header.alg;
  if (typeof alg !== 'string' || !ALG_ALLOWLIST.includes(alg)) {
    throw new HallmarkError('HLM_1002', 'unsupported_alg', `alg=${String(alg)}`);
  }

  // V1 -- type pinning. `typ` is what stops an agent passport being replayed
  // into a context that trusts a different Hallmark token shape.
  if (expectedTyp && parts.header.typ !== expectedTyp) {
    throw new HallmarkError('HLM_1004', 'bad_type', `typ=${String(parts.header.typ)} expected=${expectedTyp}`);
  }

  // V1 -- no remote key resolution.
  for (const h of REMOTE_KEY_HEADERS) {
    if (parts.header[h] !== undefined) {
      throw new HallmarkError('HLM_1005', 'malformed', `remote key header ${h} is forbidden`);
    }
  }

  // V1 -- unrecognized critical headers must be rejected, not ignored.
  const crit = parts.header.crit;
  const known = new Set(['alg', 'typ', 'kid']);
  if (crit !== undefined) {
    if (!Array.isArray(crit) || crit.length === 0) {
      throw new HallmarkError('HLM_1005', 'malformed', 'crit must be a non-empty array');
    }
    for (const c of crit) if (!known.has(c)) {
      throw new HallmarkError('HLM_1005', 'malformed', `unsupported crit member ${c}`);
    }
  }

  if (parts.signature.length === 0) {
    throw new HallmarkError('HLM_1003', 'bad_signature', 'empty signature (alg=none downgrade)');
  }

  // V1 -- key must resolve locally.
  const k = parts.header.kid;
  if (typeof k !== 'string' || k.length === 0) {
    throw new HallmarkError('HLM_1001', 'unknown_kid', 'missing kid');
  }
  const jwk = resolve(k);
  if (!jwk) throw new HallmarkError('HLM_1001', 'unknown_kid', `no local key for kid=${k}`);

  const algMatchesKey =
    (alg === 'EdDSA' && jwk.kty === 'OKP' && jwk.crv === 'Ed25519') ||
    (alg === 'ES256' && jwk.kty === 'EC' && jwk.crv === 'P-256');
  if (!algMatchesKey) {
    throw new HallmarkError('HLM_1002', 'unsupported_alg', `alg=${alg} incompatible with kty=${jwk.kty}/${jwk.crv}`);
  }

  // V2 -- signature over the exact signing input.
  const pk = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' });
  const data = Buffer.from(parts.signingInput, 'ascii');
  const ok =
    alg === 'EdDSA'
      ? edVerify(null, data, pk, parts.signature)
      : edVerify('sha256', data, { key: pk, dsaEncoding: 'ieee-p1363' }, parts.signature);
  if (!ok) throw new HallmarkError('HLM_1003', 'bad_signature', 'signature does not verify');

  // A valid signature over a non-canonical payload is still rejected: otherwise
  // one logical passport would have many valid seals, and the lineage chain
  // would depend on which serializer the issuer happened to use.
  const strictPayload = parseJsonStrict(payloadBytes.toString('utf8'));
  if (strictPayload.duplicates.length) {
    throw new HallmarkError('HLM_1005', 'malformed', `duplicate payload members: ${[...new Set(strictPayload.duplicates)].join(',')}`);
  }
  if (b64u(Buffer.from(jcs(strictPayload.value), 'utf8')) !== parts.payloadB64) {
    throw new HallmarkError('HLM_1005', 'malformed', 'payload is not in canonical JCS form');
  }
  if (b64u(Buffer.from(jcs(parts.header), 'utf8')) !== parts.headerB64) {
    throw new HallmarkError('HLM_1005', 'malformed', 'header is not in canonical JCS form');
  }

  return { ...parts, jwk, keyThumbprint: jkt(jwk) };
}

// ---------------------------------------------------------------------------
// Section 16.1 -- error registry
// ---------------------------------------------------------------------------

export class HallmarkError extends Error {
  constructor(code, reason, detail) {
    super(`${code} ${reason}${detail ? `: ${detail}` : ''}`);
    this.name = 'HallmarkError';
    this.code = code;
    this.reason = reason;
    this.detail = detail;
  }
  static fail(code, reason, detail) {
    throw new HallmarkError(code, reason, detail);
  }
  /**
   * Map to an HTTP status. Authentication-shaped failures (bad token, bad
   * signature, no proof of possession) are 401; authorization-shaped failures
   * (lineage, revocation, route policy) are 403; an exhausted budget is 429
   * because a well-behaved agent should back off rather than re-authenticate.
   */
  toHTTP() {
    const byReason = {
      budget_exhausted: 429,
      lineage_depth_invalid: 403,
      lineage_root_mismatch: 403,
      lineage_seal_mismatch: 403,
      lineage_prefix_mutated: 403,
      lineage_issuer_mismatch: 403,
      lineage_human_changed: 403,
      lineage_tenant_mixed: 403,
      lineage_audience_widened: 403,
      lineage_window_not_ancestor: 403,
      lineage_cycle: 403,
      lineage_session_reused: 403,
      edge_unregistered: 403,
      profile_not_narrowed: 403,
      budget_inflated: 403,
      budget_depth_exceeded: 403,
      key_revoked: 403,
      session_revoked: 403,
      attestation_revoked: 403,
      revocation_set_stale: 503,
      capability_unknown: 403,
      route_not_authorized: 403,
      method_not_allowed: 405,
    };
    return {
      http: byReason[this.reason] ?? 401,
      body: { error: this.reason, hallmark_error: this.code, detail: this.detail },
    };
  }
}

// ---------------------------------------------------------------------------
// Section 10 -- revocation
// ---------------------------------------------------------------------------

/**
 * A signed Revocation Manifest. The manifest is what makes revocation a
 * property of the gateway rather than a property of a single process: every
 * gateway converges on the same signed denylist, and a stale set is a
 * detectable, alertable condition rather than silent leniency.
 */
export class RevocationSet {
  constructor(manifest) {
    this.v = manifest.v;
    this.iat = manifest.iat;
    this.exp = manifest.exp;
    this.signature = manifest.signature;
    this.keys = new Set(manifest.keys ?? []);
    this.sessions = new Set(manifest.sessions ?? []);
    this.attestations = new Set(manifest.attestations ?? []);
    this.tenants = new Set(manifest.tenants ?? []);
  }

  isKeyRevoked(thumbprint) { return this.keys.has(thumbprint); }
  isSessionRevoked(sid) { return this.sessions.has(sid); }
  isAttestationRevoked(at) { return this.attestations.has(at); }
  isTenantRevoked(tid) { return this.tenants.has(tid); }

  /**
   * Section 10.4 -- freshness gate. failClosed profiles (payments, CI) treat a
   * stale set as a hard stop; bounded profiles degrade and alert. Silently
   * serving with an arbitrarily old denylist is never correct.
   */
  checkFreshness(now, maxStalenessSec, failClosed) {
    const age = now - this.iat;
    if (this.exp <= now) {
      if (failClosed) HallmarkError.fail('HLM_6004', 'revocation_set_stale', `manifest expired at ${this.exp}`);
      return { ok: false, degraded: true, age };
    }
    if (age > maxStalenessSec) {
      if (failClosed) HallmarkError.fail('HLM_6004', 'revocation_set_stale', `manifest age ${age}s > ${maxStalenessSec}s`);
      return { ok: false, degraded: true, age };
    }
    return { ok: true, degraded: false, age };
  }
}

// ---------------------------------------------------------------------------
// Section 11 -- replay suppression
//
// Two independent mechanisms, because they fail differently:
//   * jti cache  -- exact duplicate detection, works for unordered traffic.
//   * sqn window -- cheap, but tolerant of a bounded reorder window so that
//                   concurrent fan-out from one key is not self-DoS'd.
// ---------------------------------------------------------------------------

export class ReplayCache {
  constructor({ capacity = 1 << 18, reorderWindow = 32 } = {}) {
    this.capacity = capacity;
    this.reorderWindow = reorderWindow;
    this.seenJti = new Set();
    this.hwm = new Map(); // jkt -> highest accepted sqn
    this.order = [];
  }

  /** Returns true if the token is fresh, false if it is a replay. */
  admit(jti, thumbprint, sqn) {
    if (this.seenJti.has(jti)) return false;
    if (typeof sqn !== 'number' || !Number.isSafeInteger(sqn) || sqn < 0) {
      HallmarkError.fail('HLM_2005', 'sequence_invalid', `sqn=${String(sqn)}`);
    }
    const h = this.hwm.get(thumbprint) ?? 0;
    if (sqn <= h - this.reorderWindow) return false;
    this.hwm.set(thumbprint, Math.max(h, sqn));
    this.seenJti.add(jti);
    this.order.push(jti);
    if (this.order.length > this.capacity) this.seenJti.delete(this.order.shift());
    return true;
  }
}

// ---------------------------------------------------------------------------
// Section 9.2 -- disjoint budget allocation
//
// The soundness argument: a parent's remaining budget is split into
// non-overlapping slices at delegation time. A child can only ever spend its
// own slice. Because slices are disjoint, total spend across the whole tree is
// bounded by the root's budget with no cross-gateway coordination on the hot
// path -- the gateway holds a rebuildable allocation cache, not a live counter.
// ---------------------------------------------------------------------------

export const BUDGET_FIELDS = Object.freeze(['req', 'tin', 'tout', 'cost', 'conc', 'depth', 'wid']);

export function budgetSubset(child, parent) {
  for (const f of BUDGET_FIELDS) {
    const c = child[f], p = parent[f];
    if (c === undefined || p === undefined) continue;
    if (c > p) return { ok: false, field: f, child: c, parent: p };
  }
  return { ok: true };
}

export function budgetAdd(a, b) {
  const out = {};
  for (const f of BUDGET_FIELDS) {
    if (a[f] === undefined && b[f] === undefined) continue;
    out[f] = (a[f] ?? 0) + (b[f] ?? 0);
  }
  return out;
}

/**
 * Tracks which slices of a parent's budget are already spoken for. Rebuilt
 * lazily from the audit log on first sight of a parent session, so it is a
 * cache and never a source of truth.
 */
export class AllocationStore {
  constructor() { this.byParent = new Map(); }
  reserve(parentSid, childSid, alloc) {
    const set = this.byParent.get(parentSid) ?? new Map();
    if (set.has(childSid)) return false;
    set.set(childSid, alloc);
    this.byParent.set(parentSid, set);
    return true;
  }
  release(parentSid, childSid) {
    this.byParent.get(parentSid)?.delete(childSid);
  }
  committed(parentSid) {
    let total = {};
    for (const alloc of (this.byParent.get(parentSid) ?? new Map()).values()) {
      total = budgetAdd(total, alloc);
    }
    return total;
  }
  /**
   * Remaining budget at a parent session. Takes the envelope explicitly rather
   * than a claims object, so there is no way to read the wrong level.
   */
  unallocated(sid, budget) {
    const c = this.committed(sid);
    const out = {};
    for (const f of BUDGET_FIELDS) {
      if (budget[f] === undefined) continue;
      out[f] = budget[f] - (c[f] ?? 0);
    }
    return out;
  }
}
