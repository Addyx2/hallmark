#!/usr/bin/env node
// Hallmark CLI — small, dependency-free operator utility.

import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import {
  b64u, jcs, jkt, kid, seal,
  jwsSign, jwsVerify, HallmarkError,
} from './index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const usage = `Hallmark ${pkg.version}

Usage:
  hallmark self-test
  hallmark verify <jws> --key <jwk.json> [--typ <type>]
  hallmark --version
`;

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exitCode = code;
}

function selfTest() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateJwk = privateKey.export({ format: 'jwk' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const keyId = kid(publicJwk);
  const typ = 'hallmark+root-attestation';

  const { jws } = jwsSign('EdDSA', privateJwk, { typ, kid: keyId }, {
    sub: 'usr_4471',
    iat: 1772323200,
    aud: 'https://hallmark.gw.acme.example/',
  });
  jwsVerify(jws, typ, (k) => (k === keyId ? publicJwk : undefined));

  const signingInput = `${b64u(jcs({ alg: 'EdDSA' }))}.${b64u(jcs({ sub: 'usr_4471' }))}`;
  const sealValue = seal(signingInput);

  process.stdout.write(JSON.stringify({
    ok: true,
    version: pkg.version,
    kid: keyId,
    jkt: jkt(publicJwk),
    seal: sealValue,
  }, null, 2) + '\n');
}

function loadKeys(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.keys) ? raw.keys : [raw];
  const byKid = new Map();
  for (const jwk of list) {
    if (!jwk || typeof jwk !== 'object') throw new Error('key file contains a non-object entry');
    byKid.set(kid(jwk), jwk);
  }
  return byKid;
}

function verify(jws, keyPath, expectedTyp) {
  const byKid = loadKeys(keyPath);
  const result = jwsVerify(jws, expectedTyp, (k) => byKid.get(k));
  process.stdout.write(JSON.stringify({
    ok: true,
    kid: result.header.kid,
    typ: result.header.typ,
    jkt: result.keyThumbprint,
  }, null, 2) + '\n');
}

const [, , command, ...rest] = process.argv;

try {
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(usage);
  } else if (command === '--version' || command === '-v') {
    process.stdout.write(`${pkg.version}\n`);
  } else if (command === 'self-test') {
    selfTest();
  } else if (command === 'verify') {
    const jws = rest[0];
    const keyFlag = rest.indexOf('--key');
    const typFlag = rest.indexOf('--typ');
    if (!jws) throw new Error('missing <jws>');
    if (keyFlag === -1 || !rest[keyFlag + 1]) throw new Error('missing --key <jwk.json>');
    const keyPath = rest[keyFlag + 1];
    const expectedTyp = typFlag === -1 ? undefined : rest[typFlag + 1];
    if (typFlag !== -1 && !expectedTyp) throw new Error('missing --typ <type>');
    verify(jws, keyPath, expectedTyp);
  } else {
    fail(`Unknown command: ${command}\n${usage}`);
  }
} catch (err) {
  if (err instanceof HallmarkError) {
    const { http, body } = err.toHTTP();
    process.stdout.write(JSON.stringify({ ok: false, http, ...body }, null, 2) + '\n');
  } else {
    fail(String(err && err.message || err));
  }
  process.exitCode = 1;
}
