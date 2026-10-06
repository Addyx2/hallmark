// Hallmark test-vector key fixtures generator.
//
// Run ONCE to (re)generate spec/test-vectors/fixtures/keys.json.
//
//   node make-keys.mjs
//
// The resulting keys.json is committed and treated as immutable test data.
// Every vector in vectors.json is derived deterministically from these keys and
// from the frozen clock in BASE_TIME, so regenerating vectors.mjs output must be
// byte-identical as long as keys.json is unchanged.
//
// SECURITY: these private keys are published in a public repository. They sign
// nothing but conformance test vectors. Never reuse them anywhere real.

import { generateKeyPairSync, createPrivateKey } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

function ed25519(label) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    label,
    alg: 'EdDSA',
    crv: 'Ed25519',
    privateJwk: privateKey.export({ format: 'jwk' }),
    publicJwk: publicKey.export({ format: 'jwk' }),
  };
}

function es256(label) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    label,
    alg: 'ES256',
    crv: 'P-256',
    privateJwk: privateKey.export({ format: 'jwk' }),
    publicJwk: publicKey.export({ format: 'jwk' }),
  };
}

const fixtures = {
  _warning: 'PUBLISHED TEST KEYS. Sign nothing but conformance vectors. Regenerate with make-keys.mjs.',

  // Tenant infrastructure. Not agent keys.
  tenant_ca: es256('tenant_ca'),

  // Stand-in for a customer's identity provider key that signs Root Attestations.
  idp_key: es256('idp_key'),

  // An unrelated IdP key, used only to prove V2 rejects foreign signers.
  attacker_idp_key: es256('attacker_idp_key'),

  // Agent keys. Root agent binds to the human attestation; children derive from it.
  root_agent: ed25519('root_agent'),
  child_agent_a: ed25519('child_agent_a'),
  child_agent_b: ed25519('child_agent_b'),

  // A rogue agent that never received a legitimate delegation.
  rogue_agent: ed25519('rogue_agent'),

  // Attacker-held copy of a legitimate child's key, for the key-theft threat case.
  stolen_child_agent_a: ed25519('stolen_child_agent_a'),
};

// Prove every generated key actually round-trips through Node before writing.
for (const [name, k] of Object.entries(fixtures)) {
  if (name.startsWith('_')) continue;
  const sk = createPrivateKey({ key: k.privateJwk, format: 'jwk' });
  if (!sk) throw new Error(`key ${name} failed to import`);
}

const out = join(HERE, 'fixtures', 'keys.json');
writeFileSync(out, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');
console.log(`wrote ${out}`);
for (const [name, k] of Object.entries(fixtures)) {
  if (name.startsWith('_')) continue;
  console.log(`  ${name.padEnd(22)} ${k.alg.padEnd(6)} x=${k.publicJwk.x ?? '(see k)'}`);
}
