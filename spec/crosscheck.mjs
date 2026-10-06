// Cross-check the spec against the reference implementation: every V#, L#,
// T# and HLM_# the spec cites must be defined somewhere, and every code the
// implementation can throw must be documented.
import { readFileSync } from 'node:fs';

const spec = readFileSync('Hallmark-Agent-Identity-Spec.md', 'utf8');
const ref = readFileSync('test-vectors/hallmark-ref.mjs', 'utf8');
const ver = readFileSync('test-vectors/verify.mjs', 'utf8');
const vecs = readFileSync('test-vectors/vectors.mjs', 'utf8');
const code = ref + ver + vecs;

const problems = [];

const headings = [...spec.matchAll(/^#{2,3} (\d+(?:\.\d+)*)\.? /gm)].map((m) => m[1]);

// --- V-series must be defined in the spec's step table ---
const stepTable = spec.split('## 16. Verification procedure')[1] ?? '';
for (const v of [...new Set(spec.match(/\bV(\d{1,2})\b/g) ?? [])]) {
  if (!new RegExp(`\\*\\*${v}\\*\\*`).test(stepTable)) {
    problems.push(`spec cites ${v} but §16 does not define it`);
  }
}

// --- L-series must be defined in the invariant table ---
const lTable = spec.split('### 8.2 Invariants')[1]?.split('### 8.3')[0] ?? '';
for (const l of [...new Set(spec.match(/\bL(\d{1,2})\b/g) ?? [])]) {
  if (!new RegExp(`\\| ${l} \\|`).test(lTable)) {
    problems.push(`spec cites ${l} but §8.2 does not define it`);
  }
}

// --- every L1..L13 must be asserted in code ---
for (let i = 1; i <= 13; i++) {
  if (!new RegExp(`L${i}\\b`).test(ver)) problems.push(`L${i} defined in spec but never referenced in verify.mjs`);
}

// --- T-series must be defined in the threat table. The series starts at T1,
// so a T0 token (the frozen clock constant) is deliberately excluded. ---
const tTable = spec.split('## 4. Threat model')[1]?.split('## 5.')[0] ?? '';
for (const t of [...new Set(spec.match(/\bT([1-9]\d?)\b/g) ?? [])]) {
  if (!new RegExp(`\\| ${t} \\|`).test(tTable)) problems.push(`spec cites ${t} but §4 has no row ${t}`);
}

// --- every HLM_ code thrown in code must be documented in §16.1 ---
const thrown = new Set([...(code.match(/'HLM_(\d{4})'/g) ?? [])].map((s) => s.replace(/'/g, '')));
const errTable = spec.split('### 16.1 Error registry')[1]?.split('## 17.')[0] ?? '';
for (const c of [...thrown].sort()) {
  if (!errTable.includes(c)) problems.push(`${c} thrown in code but not in the §16.1 error registry`);
}

// --- every HLM_ code in the registry must be reachable in code ---
for (const c of [...new Set(errTable.match(/HLM_\d{4}/g) ?? [])].sort()) {
  if (!code.includes(c)) problems.push(`${c} documented in §16.1 but never used in code`);
}

// --- section cross-references must resolve, except those explicitly attributed
// to an external RFC, which have no heading in this document ---
for (const m of spec.matchAll(/(RFC \d+(?: §\d+(?:\.\d+)*)*\s*)?§(\d+(?:\.\d+)*)/g)) {
  if (m[1]) continue; // belongs to an external spec
  if (!headings.includes(m[2])) problems.push(`cross-reference §${m[2]} has no matching heading`);
}

// --- the reference implementation's own "Section N" comments must point at
// sections that exist. This is what catches numbering drift between doc and
// code, which is otherwise invisible until a reader gives up. ---
for (const f of ['test-vectors/hallmark-ref.mjs', 'test-vectors/verify.mjs', 'test-vectors/vectors.mjs']) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/Section (\d+(?:\.\d+)*)/g)) {
    if (!headings.includes(m[1])) problems.push(`${f} cites Section ${m[1]}, which is not a spec heading`);
  }
}

console.log(`headings: ${headings.length}`);
console.log(`HLM codes thrown in code: ${thrown.size}`);
if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log('\nspec and reference implementation are consistent');
