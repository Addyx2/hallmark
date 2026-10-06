// Hot-path cost measurement. Grounds the performance claims in
// Hallmark-Agent-Identity-Spec.md Section 17.
import { readFileSync } from 'node:fs';
import { createPublicKey, verify as edVerify, createHash } from 'node:crypto';
import { b64u, jcs, seal, jkt } from './hallmark-ref.mjs';

const KEYS = JSON.parse(readFileSync('fixtures/keys.json', 'utf8'));
const V = JSON.parse(readFileSync('vectors.json', 'utf8'));
const dec = (jws) => JSON.parse(Buffer.from(jws.split('.')[1], 'base64').toString('utf8'));
const p = V.vectors.find((v) => v.name === 'grandchild-agent');
const claims = dec(p.passport);
const pk = createPublicKey({ key: KEYS.rogue_agent.publicJwk, format: 'jwk' });
const data = Buffer.from(p.passport.split('.').slice(0, 2).join('.'), 'ascii');
const sig = Buffer.from(p.passport.split('.')[2], 'base64');

const bench = (label, iters, fn) => {
  for (let i = 0; i < 20_000; i++) fn();          // warm up
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const t1 = process.hrtime.bigint();
  const nsPerOp = Number(t1 - t0) / iters;
  console.log(`  ${label.padEnd(38)} ${nsPerOp.toFixed(0).padStart(6)} ns/op   ${(nsPerOp / 1000).toFixed(2).padStart(7)} us`);
  return nsPerOp;
};

console.log(`\nHallmark hot-path cost  (passport ${Buffer.byteLength(p.passport, 'utf8')} bytes, depth ${claims.hlm.depth})\n`);

// Iteration counts are deliberately modest: Ed25519 verify is ~113 us, so 20k
// iterations is already ~2.3 s and gives a stable mean. These are not
// microbenchmark-contest numbers; they exist to show the order of magnitude.
const N = { verify: 20_000, canon: 50_000, hash: 100_000, seal: 100_000, thumb: 100_000, lookup: 500_000, walk: 200_000 };

const verify = bench('Ed25519 signature verify', N.verify, () => edVerify(null, data, pk, sig));
const canon = bench('JCS canonicalize payload', N.canon, () => jcs(claims));
const h = bench('SHA-256 over signing input', N.hash, () => createHash('sha256').update(data).digest());
const sl = bench('seal() incl. domain separation', N.seal, () => seal(data.toString('ascii')));
const tp = bench('JWK thumbprint', N.thumb, () => jkt(KEYS.rogue_agent.publicJwk));
const lookup = bench('local kid -> JWK map lookup', N.lookup, () => new Map([[1, 2]]).get(1));

console.log('');
const criticalPath = verify + canon + h + sl + tp + lookup;
console.log(`  ${'sum of per-request crypto'.padEnd(38)} ${criticalPath.toFixed(0).padStart(6)} ns/op   ${(criticalPath / 1000).toFixed(2).padStart(7)} us`);

// Depth-bounded registry walk: the lineage anchor cost.
const edges = new Map();
for (let i = 0; i < 16; i++) edges.set(`s${i}`, { parentSub: `s${i + 1}`, tipH: 'x', depth: 16 - i });
const walk = bench('spawn-edge walk, depth 16', N.walk, () => {
  let idx = 15, sid = 's0';
  while (idx > 0) { const e = edges.get(sid); if (!e) break; sid = e.parentSub; idx--; }
});
console.log(`  ${'per-hop cost'.padEnd(38)} ${(walk / 16).toFixed(1).padStart(6)} ns/hop`);

const budgetUs = criticalPath / 1000 + walk / 1000;
console.log(`\n  estimated full verify() crypto+lineage: ${budgetUs.toFixed(1)} us  (${(budgetUs / 5000 * 100).toFixed(2)}% of a 5 ms budget)\n`);
