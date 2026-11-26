import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  b64u, jcs, seal, jkt, kid,
  jwsSign, jwsVerify, parseJsonStrict,
  HallmarkError, RevocationSet, ReplayCache,
} from '../src/index.js';

function keyPair(kind = 'ed25519') {
  const { privateKey, publicKey } = generateKeyPairSync(kind);
  return {
    privateJwk: privateKey.export({ format: 'jwk' }),
    publicJwk: publicKey.export({ format: 'jwk' }),
  };
}

test('base64url, JCS and Seal are stable and domain-separated', () => {
  assert.equal(b64u(Buffer.from('f')), 'Zg');
  assert.equal(jcs({ b: 1, a: 2 }), '{"a":2,"b":1}');
  const a = seal(b64u(jcs({ b: 1, a: 2 })) + '.' + b64u(jcs({ sub: 'usr_4471' })));
  const b = seal(b64u(jcs({ a: 2, b: 1 })) + '.' + b64u(jcs({ sub: 'usr_4471' })));
  assert.equal(a, b, 'canonical member order yields the same Seal');
  const c = seal(b64u(jcs({ b: 1, a: 2 })) + '.' + b64u(jcs({ sub: 'usr_0000' })));
  assert.notEqual(a, c, 'payload change yields a different Seal');
  assert.equal(a.length, 43);
});

test('EdDSA and ES256 sign/verify through the local resolver', () => {
  for (const [alg, kind] of [['EdDSA', 'ed25519'], ['ES256', 'ec']]) {
    const { privateJwk, publicJwk } = kind === 'ec'
      ? (() => {
          const k = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
          return { privateJwk: k.privateKey.export({ format: 'jwk' }), publicJwk: k.publicKey.export({ format: 'jwk' }) };
        })()
      : keyPair();

    const keyId = kid(publicJwk);
    const typ = 'hallmark+root-attestation';
    const { jws } = jwsSign(alg, privateJwk, { typ, kid: keyId }, {
      sub: 'usr_4471', iat: 1772323200,
    });
    const result = jwsVerify(jws, typ, (k) => (k === keyId ? publicJwk : undefined));
    assert.equal(result.keyThumbprint, jkt(publicJwk));
    assert.equal(result.header.alg, alg);

    assert.throws(
      () => jwsVerify(jws, 'hallmark+passport', (k) => (k === keyId ? publicJwk : undefined)),
      (e) => e instanceof HallmarkError && e.code === 'HLM_1004',
    );
  }
});

test('duplicate JSON members are reported, not silently collapsed', () => {
  const parsed = parseJsonStrict('{"a":1,"a":2}');
  assert.deepEqual(parsed.duplicates, ['a']);
  assert.deepEqual(parsed.value, { a: 2 });
});

test('HallmarkError maps to a gateway response', () => {
  const err = new HallmarkError('HLM_6004', 'revocation_set_stale', 'age 900s');
  assert.deepEqual(err.toHTTP(), {
    http: 503,
    body: { error: 'revocation_set_stale', hallmark_error: 'HLM_6004', detail: 'age 900s' },
  });
});

test('revocation freshness fails closed when asked to', () => {
  const set = new RevocationSet({ v: 1, iat: 100, exp: 200 });
  assert.equal(set.checkFreshness(150, 60, false).ok, true);
  assert.throws(
    () => set.checkFreshness(150, 10, true),
    (e) => e instanceof HallmarkError && e.code === 'HLM_6004',
  );
});

test('replay cache rejects duplicate jti and stale sequence numbers', () => {
  const cache = new ReplayCache({ reorderWindow: 4 });
  assert.equal(cache.admit('jti-1', 'thumb', 10), true);
  assert.equal(cache.admit('jti-1', 'thumb', 11), false);
  assert.equal(cache.admit('jti-2', 'thumb', 5), false);
  assert.equal(cache.admit('jti-3', 'thumb', 12), true);
});
