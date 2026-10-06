# Hallmark Agent Identity Protocol

**Specification version:** 1.0 (draft)
**Status:** Draft for review. Not yet ratified. No production deployment.
**Date:** 2026-09-28
**Reference implementation:** [`test-vectors/hallmark-ref.mjs`](test-vectors/hallmark-ref.mjs)
**Conformance suite:** [`test-vectors/vectors.mjs`](test-vectors/vectors.mjs) — 38 vectors, 4 design properties, 4 enforcement points; all passing

---

## 0. Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are to be
interpreted as described in RFC 2119.

Where this document and the reference implementation disagree, **this document is
normative and the implementation is a bug.** The implementation exists so that
"MAY" and "SHOULD" claims in this document are falsifiable rather than decorative.

Every numbered invariant (`L1`…`L13`, `V1`…`V10`) is asserted by the conformance
suite. If an invariant is weakened, the suite fails.

---

## 1. What this protocol is for

An autonomous agent takes an action. Somebody must be able to answer, months
later and without cooperation from the agent: *which human authorized this, under
what policy, spawned through which chain of sub-agents, and is that authority
still valid?*

Legacy IAM cannot answer this. A service account has no human behind it, and by
the time a post-incident investigator asks, the ephemeral sub-agent that made the
call is gone, along with whatever logs it left.

This protocol produces a **signed, short-lived, human-bound credential for every
agent action**, and a gateway that refuses to forward traffic it cannot attribute.

The design rests on one rule, stated once and enforced everywhere below:

> **Authority flows downward and only narrows.**
>
> A child can never hold more authority than its parent: not more capability,
> not more budget, not more time, not a different human, not a different tenant,
> and never a different audience.

Everything else — the seal chain, the budget envelopes, the revocation manifest,
the conformance suite — exists to make that rule mechanically checkable at
roughly 116 microseconds per request.

---

## 2. Design goals

| # | Goal | How it is measured |
| --- | --- | --- |
| G1 | Every accepted request resolves to a human identity | `V7` + `L6`; no path through `verifyPassport()` returns without a verified `azp` |
| G2 | Verification fits inside a 5 ms edge budget | Measured in §17: ~116 µs of crypto, 2.3% of budget |
| G3 | Sub-agents cannot outlive or out-spend their parent | `L10`, `L11`, `V3` (TTL ceiling) |
| G4 | A compromised agent key is contained within a bounded window | TTL (≤120 s) + revocation propagation (§10); ~150 s worst case |
| G5 | Full lineage is independently auditable offline | §14 append-only log; §8.6 Level 2 replay |
| G6 | Revocation never silently degrades into leniency | `V8` freshness gate is fail-closed by profile class (§10.4) |

## 3. Non-goals

Hallmark is deliberately **not**:

- A general IAM system, an OAuth AS/DP, or an OIDC provider.
- A replacement for SPIFFE/SPIRE or workload identity. It layers provenance on
  top; a gateway may use both, and a Hallmark passport can be bound to an SVID via
  `cnf.jkt` (§12.3).
- A data-plane firewall. It authorizes requests; it does not inspect payloads.
- A content-safety filter. It answers "who authorized this", not "is this wise".
- A DLP, a SIEM, or an audit-log product. It emits a provable event stream (§14)
  that those systems consume.

### 3.1 Explicitly deferred

| Item | Why deferred |
| --- | --- |
| Cross-tenant / cross-org delegation | Needs a federated trust root and a governance model; L7 currently forbids it outright. |
| Post-quantum signatures | `alg` is a closed allowlist, so ML-DSA can be added without breaking parsers. Requires a crypto-agility decision for `jwk` sets. |
| Delegation without a live parent | An agent that is offline cannot currently spawn. Requires a delegated-authority-interchange-style indirection, which weakens G1. |
| Streaming protocols (SSE, gRPC bidi) | Needs a chunk-level signing scheme; the current model signs per request only. |

---

## 4. Threat model and security properties

Adversaries are assumed to control: agent runtimes, sub-agent orchestration
loops, the network, and any agent key they can obtain. They are **not** assumed
to control the tenant IdP, the tenant CA, or the Hallmark control plane.

| ID | Threat | Property relied on | Residual risk |
| --- | --- | --- | --- |
| T1 | Unauthenticated traffic to an inference endpoint | No passport → no `Authorization` → L7 drop | None if L4 is also enforced (§12.4) |
| T2 | Looping sub-agents draining API credits | `L10` disjoint budget slices, root cap | A misconfigured root budget that is itself too large |
| T3 | Compromised agent key | TTL ceiling (`V3`), key denylist, PoP binding | Bounded by `TTL + revocation staleness`; see §10.5 |
| T4 | Captured request replayed | `V6` `jti` cache + `sqn` window; `V10` PoP | If PoP is skipped and TTL is long |
| T5 | Forged lineage (impersonating a parent) | `L3` seal recomputation, `L4` prefix immutability, §8.5 edge registry | None without breaking a signature or the registry |
| T6 | Laundering an agent under a different human | `L2` + `cnf.jkt` binding in the attestation; `L6` | None; a stolen key cannot change `azp` |
| T7 | Human swaps `azp` mid-chain | `L6` checked at every spawn | Spawn-time-only if parent absent at request time (§8.2) |
| T8 | `alg:none` / HS256 confusion | `V1` closed allowlist, `alg`↔`kty` agreement check | None |
| T9 | SSRF via remote key resolution | `V1` forbids `jku`/`x5u`/`x5c` | None; resolver must be local |
| T10 | Gateway reusing agent credentials upstream | Per-hop audience binding, `aud` narrowing (`L8`) | Requires upstream to also verify |
| T11 | Two implementations disagreeing on the same passport | JCS canonicalization enforced at `V2`; `L3` seals | A non-conforming implementation is a conformance failure, not a subtle bug |
| T12 | Revocation service outage | `V8` fail-closed on `strict` profiles (§10.4) | Availability vs. security; policy call, per capability |
| T13 | Replay of a whole lineage tree to re-derive authority | `V6` per-session `jti`; tree bound to one attestation | None |

**T7 deserves emphasis.** Lineage invariants are enforced in two places, at
different strengths, and an implementer who confuses them will build something
that looks correct and is not:

- **At spawn**, the parent passport is in hand and *every* invariant is checked.
- **At request time**, only the leaf is typically presented. The structural
  invariants are re-checked; the narrowing invariants (`L5`, `L6`, `L8`, `L10`,
  `L11`, `L12`) are not re-derived, because their enforcement is *memoized* in
  the spawn edge (§8.5), which can only be written by an issuer that just
  verified the parent.

This is a sound delegation argument, not a shortcut — but it is only sound
because edge writes are unforgeable. An implementation with a mutable or
externally-writable edge store has given up T5 and T7 entirely.

---

## 5. Roles and trust

| Role | Key | Signs |
| --- | --- | --- |
| Human operator | Passkey / IdP credential | Nothing directly; their IdP signs the attestation |
| Customer IdP | ES256 (P-256) | Root Attestations |
| Tenant CA | ES256 (P-256) | Revocation manifests, policies |
| Root agent | Ed25519, bound by `cnf.jkt` | Its own passport |
| Sub-agent | Ed25519, ephemeral | Its own passport |
| Hallmark gateway | none (verifies only) | audit events |
| Hallmark control plane | ES256 | agent key registration, policy publication |

The gateway holds **no signing key**. It verifies and records. A compromised
gateway can deny service or forge audit entries, but it cannot mint authority
that survives independent replay against the customer's IdP — which is the
property that makes the compliance story credible.

Trust roots per tenant: a set of IdP public keys and a tenant CA public key.
Agent keys are registered against a `kid` and pinned locally; §4 T9 forbids
runtime key discovery.

---

## 6. Cryptographic primitives

### 6.1 Algorithms

| Purpose | Algorithm | Notes |
| --- | --- | --- |
| Agent passports | **EdDSA** (Ed25519) | Primary. Small signatures, fast verify. |
| Root attestations, policies, revocation | **ES256** (ECDSA P-256 + SHA-256) | Interop with cloud HSMs and enterprise IdPs that only issue EC keys. |
| Seals, budgets, counters | SHA-256 | |

The allowlist is **closed**: `["EdDSA", "ES256"]`. `HS*` is rejected because a
shared secret is extractable by every holder, which would mean agent keys are
never actually private. `none` is rejected. `Ed25519ph`, `Ed25519ctx` and `EdDSA`
with non-`Ed25519` curves are rejected. `RSA1_5` is rejected (Bleichenbacher).

Ed25519 is primary because verify cost dominates at the edge and Ed25519 verify
is both faster and smaller than P-256-with-SHA-256. ES256 is retained for the
control plane, where interoperability with customer HSMs matters more than
throughput and where signatures are minted rarely.

### 6.2 Canonicalization (JCS)

All hashing is over **RFC 8785 JSON Canonicalization Scheme** output. This is not
an optimisation; it is load-bearing. The seal chain compares hashes of *serialized
bytes*, so if two implementations serialize the same claims differently, a
legitimate child looks forged to one and a forged child looks legitimate to the
other.

Hallmark payloads are constrained to safe integers and strings, so only JCS's
member-ordering rule (RFC 8785 §3.2.3, sort by UTF-16 code unit) is exercised. An
implementation **MUST** additionally enforce:

- No duplicate object members anywhere in header or payload.
- No `null` where a value is required.
- No trailing data after the top-level value.
- No `undefined`, no non-integer numbers, no exponents, no leading zeros.

A verifier **MUST** reject a passport whose payload is not already in canonical
form, even if the signature over it is valid. Otherwise one logical passport has
many valid seals. Conformance vectors `duplicate-json-member` and
`non-canonical-payload` cover both halves of this rule, and property
`seal-is-canonicalization-sensitive` asserts that member order genuinely changes
the seal.

### 6.3 The Seal

```
seal(v, signing_input) = BASE64URL( SHA-256( DS(v) || 0x00 || signing_input ) )

DS(v)   = "hallmark.seal.v1"          ; ASCII, no trailing NUL
signing_input = the ASCII bytes of BASE64URL(JCS(header)) || "." || BASE64URL(JCS(payload))
```

Three deliberate design choices:

**The signature is not covered.** A child must be able to name its parent's
identity before, or without, holding the parent's signature. A forged signature
yields a different seal, which `V2` rejects at verification time. Including the
signature would have forced every ancestor to be transmitted.

**The domain separator is present.** Without it, a Hallmark seal is a bare
SHA-256 and could be replayed as the digest of something else. Property
`seal-domain-separation` asserts the difference is real.

**ES256 randomization is absorbed.** P-ECDSA uses a fresh random `k` per
signature, so two attestations over identical claims have different JWS bytes.
Because the seal covers the signing input and not the signature, they still share
a seal. Property `seal-excludes-signature` asserts precisely this — it is the
reason a mixed Ed25519/ES256 hierarchy is viable at all.

### 6.4 Key thumbprints

`jkt` is the RFC 7638 JWK SHA-256 thumbprint over the required members only:
`{crv,kty,x}` for OKP, `{crv,kty,x,y}` for EC. `kid` is
`"ed25519:" | "p256":` followed by the first 16 base64url characters of the
thumbprint. `kid` is a routing hint only; **the thumbprint is the identity.**
A verifier that trusts `kid` without checking it against a registered key is
vulnerable to T9.

---

## 7. Data structures

### 7.1 Root Attestation — `typ: "hallmark+root-attestation"`

The only artifact signed by a key a human actually controls. Everything
downstream is agent-to-agent, and the seal chain exists to tie that agent-to-agent
web back to this signature.

```json
{
  "iss": "https://idp.acme.example/",
  "sub": "usr_4471",
  "aud": "https://hallmark.gw.acme.example/",
  "iat": 1772323200, "nbf": 1772323200, "exp": 1772409600,
  "jti": "at_0001",
  "amr": ["hwk", "user_presence", "mfa"],
  "cnf": { "jkt": "tSJk1sQtAlCNgUp8xEX11qBKgrAUE9wZCimwWzYgKyA" },
  "hlm": {
    "v": 1,
    "tid": "tnt_acme",
    "agent": {
      "spid": "spid://acme/research-orchestrator",
      "name": "Research Orchestrator",
      "caps": ["llm.inference.v1", "vector.search.v1", "code.exec.sandbox.v1"],
      "profiles": ["llm.chat.default.v1", "llm.batch.v1"]
    },
    "pol": { "id": "pol_acme_default", "v": 7 },
    "budget": { "req": 5000, "tin": 536870912, "tout": 26843545,
                "cost": 500000, "conc": 32, "depth": 4, "wid": 8 }
  }
}
```

**`cnf.jkt` is the load-bearing claim.** It binds the human's authorization to
exactly one agent public key, which simultaneously defeats two attacks: a captured
attestation cannot be re-pointed at a key the attacker controls (T6), and a stolen
agent key cannot be laundered under a different human. Vectors
`rogue-claims-others-attestation` and `attestation-from-untrusted-idp` exercise
both directions.

`amr` records *how* the human proved presence (`hwk` = hardware key,
`user_presence` = a tap). An auditor can demand `user_presence` for destructive
operations without changing the protocol.

#### 7.1.1 Passkey binding

For high-assurance deployments the attestation is authorized by a WebAuthn
assertion rather than an IdP refresh token:

```
challenge = BASE64URL(SHA-256(JCS(attestation_claims)))
```

The passkey signs that challenge, so the assertion is bound to the exact
attestation content and cannot be replayed onto modified claims. This keeps the
private key inside the authenticator — the human's key is never exportable and
never present in an agent process.

### 7.2 Agent Passport — `typ: "hallmark+agent-passport"`

JWS compact serialization. Header: `{ "alg", "typ", "kid" }` only.

```json
{
  "iss": "ses_child_0002",
  "sub": "ses_gc_0004",
  "jti": "ses_gc_0004",
  "aud": "https://hallmark.gw.acme.example/",
  "azp": "usr_4471",
  "amr": ["agent_delegation"],
  "iat": 1772323200, "nbf": 1772323200, "exp": 1772323260,
  "sqn": 1,
  "hlm": {
    "v": 1,
    "tid": "tnt_acme",
    "spid": "spid://acme/summarizer-01",
    "name": "Summarizer 01",
    "prof": "llm.chat.default.v1",
    "caps": ["llm.inference.v1"],
    "depth": 3,
    "ln": [
      { "sid": "at_0001",       "h": "7_WbcECGm3l0o59veVbPT0MxRmqagZaqZp1hNMsanLU" },
      { "sid": "ses_root_0001", "h": "ZTsj644aFvFqS0RI5-Yk0cyLujeQuch00Td-WB6v7sE" },
      { "sid": "ses_child_0002","h": "XZR-d3zyyRsoV1cmpz0bJvAfuGIt9bEn91EE4eAlDaY" }
    ],
    "root": { "at": "at_0001",
              "h": "7_WbcECGm3l0o59veVbPT0MxRmqagZaqZp1hNMsanLU",
              "iss": "https://idp.acme.example/",
              "sub": "usr_4471" },
    "budget": { "req": 40, "tin": 4194304, "tout": 262144,
                "cost": 1500, "conc": 1, "depth": 0, "wid": 0 },
    "pol": { "id": "pol_acme_default", "v": 7 }
  }
}
```

| Claim | Type | Meaning |
| --- | --- | --- |
| `iss` | string | Session id of the **parent** that minted this. For depth 1, the tenant's root-issuer URN. |
| `sub` | string | **This** agent's session id. Unique. |
| `jti` | string | Same as `sub`. Replay key. |
| `sqn` | int | Monotonic per-key counter. §11.2. |
| `azp` | string | The human. **Immutable down the chain** (`L6`). |
| `aud` | string \| string[] | Gateway audience. May only narrow (`L8`). |
| `cnf` | object | Optional `jkt` requiring proof of possession (`V10`). |
| `hlm.ln` | array | Lineage, oldest → newest. `ln[0]` is always the root attestation. |
| `hlm.root` | object | Attestation coordinates, duplicated for audit self-containment. |
| `hlm.caps` | string[] | Capability set. May only narrow (`L12`). |
| `hlm.prof` | string | Policy-scoped rate/telemetry profile. **Not** an authority; see §9.3. |
| `hlm.budget` | object | Fully resolved allocation. §8. |
| `hlm.depth` | int | **MUST** equal `hlm.ln.length` (`L1`). |

`depth` is redundant with `ln.length` on purpose. A redundancy that is
cross-checked is a cheap tripwire; a redundancy that is not is a liability, which
is why `L1` is normative and enforced.

`azp` carries a raw OIDC subject. Gateways **MUST** redact `azp`, `ln`, and
`cnf` from request logs by default (subject identifiers are PII in most
jurisdictions); `jti` is sufficient for correlation.

### 7.3 ABNF

```abnf
hallmark-passport  = compact-jws        ; header limited to alg/typ/kid
budget             = "{" budget-field *( "," budget-field ) "}"
budget-field       = ( "req" / "tin" / "tout" / "cost" / "conc" / "depth" / "wid" )
                      ":" non-negative-int
lineage            = "[" lineage-entry *( "," lineage-entry ) "]"
lineage-entry      = "{" ( "h" ":" seal-value ) "," ( "sid" ":" sid ) "}"
seal-value         = 43*( ALPHA / DIGIT / "-" / "_" )   ; base64url of 32 bytes
sid                = 1*64unreserved
capability         = 1*64( lower / DIGIT / "." / "-" / "_" )
non-negative-int   = %x30 / ( %x31-39 *DIGIT )           ; no leading zeros, no sign
```

`non-negative-int` forbidding `+`, `-`, exponents and leading zeros is what lets
§6.2's canonicalization be total. The reference implementation additionally
rejects any number that is not a JavaScript safe integer.

### 7.4 Policy document

Policies are signed by the tenant CA, distributed out of band, and pinned by
`id@version`. **An unknown policy version is a hard failure**, not a fallback to
defaults: a downgrade must never silently widen access.

```json
{
  "id": "pol_acme_default", "v": 7,
  "maxDepth": 4, "maxTtlSec": 120,
  "revocation": "strict",
  "capabilities": {
    "llm.inference.v1": {
      "methods": ["POST"],
      "pathPrefixes": ["/v1/chat/completions", "/v1/completions"],
      "profiles": ["llm.chat.default.v1", "llm.batch.v1"],
      "tin": 33554432, "tout": 8192, "cost": 2500
    },
    "vector.search.v1": {
      "methods": ["POST", "GET"],
      "pathPrefixes": ["/v1/embeddings", "/v1/vectors"],
      "profiles": ["llm.chat.default.v1", "vec.search.default.v1"]
    },
    "code.exec.sandbox.v1": {
      "methods": ["POST"],
      "pathPrefixes": ["/v1/sandbox/exec"],
      "profiles": ["llm.chat.default.v1"]
    }
  }
}
```

### 7.5 Revocation manifest

```json
{ "v": 1, "iat": 1772323200, "exp": 1772323260,
  "keys": ["<jkt>"], "sessions": ["ses_..."], "attestations": ["at_..."],
  "tenants": ["tnt_..."], "signature": "<ES256 over JCS of the object sans signature>" }
```

`v` is strictly monotonic. A manifest with `v` lower than the one already
applied **MUST** be rejected — otherwise an attacker who can serve an old signed
manifest can un-revoke a key.

---

## 8. The Blended Lineage Protocol

### 8.1 The chain

```
Human ──attestation──► Root Agent ──passport──► Sub-Agent ──passport──► Sub-Agent
  (IdP key)            (Ed25519)               (Ed25519)              (Ed25519)
        │                  │                       │                      │
   ln[0] ◄────────────────┴── ln[1] ◄──────────────┴── ln[2] ◄────────────┘
   (seal)                     (seal)                      (seal)
```

`hlm.ln[k].h` is the seal of the token issued at depth `k+1`. `ln[0]` is always
the root attestation. `depth == ln.length` counts agents, not hops.

### 8.2 Invariants

All are checked at spawn time. Structural ones are re-checked at request time.

| ID | Invariant | Rationale |
| --- | --- | --- |
| L1 | `depth == ln.length`, `1 ≤ depth ≤ policy.maxDepth` | Depth bound prevents unbounded header growth and runaway fan-out. |
| L2 | `ln[0] == {sid: root.at, h: root.h}`, and `root.h` equals the seal of the locally held, signature-verified attestation | Anchors the leaf to the human. |
| L3 | `ln[depth-1].sid == parent.sub` and `ln[depth-1].h == seal(parent signing input)` | The immediate link is cryptographically checked, not asserted. |
| L4 | `ln[0..depth-2]` is byte-identical to `parent.ln` | Ancestry is append-only. A child cannot rewrite history. |
| L5 | `iss == parent.sub` | The issuer is the parent, not a bystander. |
| L6 | `azp == parent.azp` | **Human identity is immutable.** The whole accountability guarantee. |
| L7 | `hlm.tid == parent.hlm.tid` | No cross-tenant spawning. |
| L8 | `aud ⊆ parent.aud` | A child cannot widen its blast radius. |
| L9 | `sub ∉ ln`, `sub != iss` | No self-spawn, no cycles. |
| L10 | `budget` componentwise `<=` parent, and the slice fits unallocated remainder | Authority cannot be created by delegation. |
| L11 | `nbf ≥ parent.nbf` and `exp ≤ parent.exp` | A child cannot outlive its parent. |
| L12 | `caps ⊆ parent.caps` | No capability escalation. |
| L13 | No `sid` appears twice in `ln` | Forces a tree. One human authorization cannot fan out into two independent chains. |

### 8.3 Spawn algorithm (issuer side)

```
spawn(parent_passport, child_params):
  1. verify(parent_passport)                     ; full verification, L1..L13
  2. assert child_params.azp  == parent.azp                     ; L6
     assert child_params.tid  == parent.tid                     ; L7
     assert child_params.aud  ⊆ parent.aud                      ; L8
     assert child_params.caps ⊆ parent.caps                    ; L12
     assert child_params.budget <= parent.budget                ; L10
     assert child_params.budget <= unallocated(parent)          ; L10
     assert child.nbf >= parent.nbf, child.exp <= parent.exp   ; L11
     assert child.exp - child.iat <= policy.maxTtlSec           ; V3
  3. ln := copy(parent.ln) ++ [{ sid: parent.sub, h: seal(parent) }]
  4. claims := { iss: parent.sub, sub: fresh_id(), azp: parent.azp,
                 ln: ln, depth: length(ln), ... }
  5. jws := sign(child_key, JCS(header), JCS(claims))
  6. registry.register({ child: claims.sub, parent: parent.sub,
                         tipH: ln[last].h, depth: length(ln),
                         rootAt: ln[0].sid, rootH: ln[0].h,
                         parentSignerJkt: thumbprint(parent_key) })   ; §8.5
  7. return jws
```

Step 2 is the enforcement point for the narrowing invariants. An SDK **MUST NOT**
expose a spawn API that skips it. There is deliberately no API that mints a
passport from an attestation alone except the root mint itself — that makes
"spawned without lineage" a structurally impossible state rather than a policy
violation to be caught later.

### 8.4 Minting the root passport

The only path that does not require a parent. Requires possession of the exact
key named in the attestation's `cnf.jkt`, so the attestation cannot be redirected.

### 8.5 The Spawn Edge Registry

The hot path receives one passport: the leaf. Verifying its signature and
checking `ln[0]` against the attestation anchors the leaf to the human — but
`ln[1..depth-1]` would otherwise be unbacked hashes an attacker could fabricate
freely. An attacker holding a stolen root-agent key could mint a plausible
depth-5 chain with invented intermediates, and every check would pass.

The registry closes this. One edge is recorded per spawn, and an edge can only be
written at a moment when the parent passport was live and verified. It is
therefore a **verified path cache, not an authority**. Walking it costs `depth` map lookups (11.8 ns/hop, measured — §17):

```
anchor(claims):
  idx := claims.depth - 1 ;  sid := claims.sub
  while idx > 0:
      e := registry[sid]                                ; else HLM_4011
      assert e.depth     == idx + 1                     ; else HLM_4001
      assert e.parentSub == ln[idx].sid                 ; else HLM_4005
      assert e.tipH      == ln[idx].h                   ; else HLM_4003
      if idx == 1: assert e.rootAt/rootH == ln[0];  rootSignerJkt := e.parentSignerJkt
      sid := e.parentSub ;  idx := idx - 1
  return rootSignerJkt
```

Then `attestation.cnf.jkt == rootSignerJkt` must hold. For a depth-1 passport
that is simply its own signing key; deeper passports recover the root key through
the walk. This is what makes the chain, not just its tip, cryptographically real
for an arbitrary leaf.

The registry is a cache. It is populated lazily from the audit log on first sight
of a session and is fully rebuildable. It is **not** a source of truth and a
gateway **MUST** fall back to §8.6 rather than fail closed if it is cold.

### 8.6 Verification levels

| Level | Input | Guarantees | Cost |
| --- | --- | --- | --- |
| **1D** | Leaf passport + edge registry | Full chain anchored, all narrowings memoized | ~150 µs, no extra bytes |
| **1P** | Leaf + parent passport | L1–L13 fully re-derived | ~300 µs, +1.3 KB |
| **2** | Full ancestry replayed from the audit log | All invariants re-derived from the attestation down; third-party verifiable | seconds, offline |

Level 2 is what a SOC 2 auditor or a customer's own security team runs. It
depends on nothing the gateway asserts — only on signatures and the audit log.
Level 1D is what runs on every request. Levels 1D and 1P are complementary: 1D
for the data plane, 1P where bandwidth is cheap and an independent re-derivation
is worth the latency.

---

## 9. Budgets, capabilities and policies

### 9.1 Budget envelopes

| Field | Meaning |
| --- | --- |
| `req` | Maximum requests |
| `tin` | Maximum input bytes / prompt tokens |
| `tout` | Maximum output bytes / completion tokens |
| `cost` | Maximum spend, in micro-USD (integer; never a float) |
| `conc` | Maximum concurrent in-flight requests |
| `depth` | Maximum further depth this agent may delegate |
| `wid` | Maximum immediate children |

All are non-negative safe integers. **Budgets are fully resolved at mint time** —
there is no inheritance. This is deliberate: a gateway handling a leaf request
can enforce its budget without fetching or reconstructing a parent, which keeps
the hot path to one local lookup.

### 9.2 Disjoint allocation

A parent's remaining budget is split into **non-overlapping slices** at
delegation. A child can only ever spend its own slice. Because the slices are
disjoint, total spend across the entire tree is bounded by the root's budget
with **no cross-gateway coordination on the hot path**.

This is the key move for G2. The naive design — a shared counter per session
consulted on every request — requires a network round trip or an eventually
consistent store, and eventually-consistent counters are exactly how a "bounded
spend" guarantee quietly stops holding. Disjointness makes the bound a
structural property instead of a consistency property.

Soundness argument, stated so it can be attacked: a parent is trusted for its own
bookkeeping but not for the cap. A malicious parent can lie about its unallocated
remainder, but it cannot cause total spend to exceed the root budget, because
each child's slice is validated against the *root-level* accounting at mint and
the gateway charges only the slice the child actually holds.

Cost is **decremented on response**, from the observed usage, not from the
request's pre-flight estimate. Estimating up front and trusting the estimate is
how token budgets become fiction. Idempotency keys **MUST** be honoured so that a
retried charge is not double-counted; a duplicated charge is a correctness bug,
not a security one, but it is the kind that erodes trust in the number on a
dashboard.

### 9.3 Capabilities and profiles

A **capability** is an authority: it maps to a set of routes, methods, and
per-request limits. Capabilities narrow down the chain (`L12`).

A **profile** (`hlm.prof`) is *not* an authority. It is a policy-scoped
rate-limiting and telemetry selector. A child **MAY** select a different profile
than its parent; what constrains it is that the chosen profile must be bound to a
capability the child still holds (§9.4). Conflating the two is a design error this
spec calls out explicitly, because an early draft did exactly that and it
incorrectly denied legitimate delegations.

### 9.4 Route authorization

The request is authorized if **at least one** capability the agent holds permits
`method` + `path` + `profile`. Selecting the *first* matching capability instead
would let the order of a sorted capability array decide authorization — which
means the same set of capabilities could be accepted or denied depending on
sort order, and across implementations. This is a real bug class, and the
conformance suite pins it.

---

## 10. Revocation

### 10.1 Why short-lived tokens are not enough

Passports live at most `policy.maxTtlSec` (default 120 s, hard ceiling 300 s). The
TTL ceiling is normative and enforced at `V3` — without it, a compromised root
agent mints a year-long passport and revocation becomes purely cosmetic. That is
the single most important anti-abuse rule in the document.

### 10.2 Scopes

| Scope | Kills | Use for |
| --- | --- | --- |
| `keys[]` | Every session of one agent key | Compromised agent host |
| `sessions[]` | One agent session | Misbehaving sub-agent, surgical |
| `attestations[]` | Everything under one human authorization | Offboarding, revoked access |
| `tenants[]` | Everything for one tenant | Emergency tenant-wide kill |

The dashboard's "one-click kill switch" is a `keys[]` or `sessions[]` append plus
a version bump. It is deliberately boring, because a kill switch that requires
judgment under pressure is not a kill switch.

### 10.3 Distribution

Manifests are signed, versioned, and pushed. A gateway **MUST** reject a manifest
whose `v` is not strictly greater than the last applied version, and **MUST**
verify the tenant CA signature before applying.

### 10.4 Freshness: fail closed, per capability

```
age = now - manifest.iat
if manifest.exp <= now or age > maxStaleness:
    if capability_class.revocation == "strict": REJECT  (HLM_6004, HTTP 503)
    else: serve in degraded mode, and alert
```

`strict` is the default and **SHOULD** be used for anything that moves money,
writes to a database, or triggers a deployment. `bounded` trades a bounded
revocation delay for availability on read-only routes, and **MUST** emit a metric
whenever it is used.

Silently continuing to serve on an arbitrarily old denylist is never correct. The
question is only whether a given route can afford the outage, and that is a
per-capability policy decision, not a global one.

### 10.5 Containment window

Worst-case exposure for a compromised key:

```
TTL + revocation_staleness + in-flight
= 120 s + 30 s + one request  ≈  150 s
```

This is the honest answer to "how fast is your kill switch," and it is a direct
consequence of the TTL ceiling. Shortening `maxTtlSec` shortens the window
linearly at the cost of more re-minting; for high-value capabilities, 30–60 s
TTLs are appropriate.

---

## 11. Replay suppression

### 11.1 `jti` cache

Bounded set of seen `jti` values, LRU-evicted, default 2^18 entries. Exact
duplicate detection, works for unordered traffic. Eviction is safe: the `sqn`
window below is the backstop, and both are bounded by memory, not by attacker
input.

### 11.2 `sqn` window

Per-key high-water mark with a bounded reordering window (default 32):

```
admit if sqn > high_water - 32
```

A strict monotonicity rule would be wrong: one key legitimately signs many
concurrent in-flight requests, so strict ordering would self-DoS under fan-out.
The window tolerates reordering while still collapsing a long-captured replay.

Both mechanisms are required. `jti` is exact but memory-bound; `sqn` is cheap and
order-tolerant but cannot distinguish a replay from a legitimate in-window reuse.
Either alone is exploitable.

---

## 12. Transport bindings

### 12.1 HTTP/1.1 and HTTP/2

```http
POST /v1/chat/completions HTTP/1.1
Host: inference.acme.internal
Authorization: Hallmark eyJhbGciOiJFZERTQSIsImtpZCI6ImVkMjU1MT...
Content-Type: application/json
```

`Authorization` scheme is `Hallmark` (case-insensitive per RFC 7235). A gateway
**MUST** reject the request — not fall through — when the scheme is `Hallmark` and
verification fails. Falling through to an unauthenticated upstream path is the
canonical way a "zero-trust gateway" becomes an open relay.

### 12.2 Other transports

- **gRPC / Kafka:** `authorization` metadata key, same value.
- **Non-HTTP:** a `X-Hallmark-*`-style header block may replace `Authorization`,
  but the *value* **MUST** be the same compact JWS. The signature covers claims,
  not transport, so no transport gets weaker verification by accident.

### 12.3 Proof of possession

A valid signature proves a key was used, not that the caller holds it. Without
PoP, a captured request log is a replay kit — and request logs are exactly what
gets exfiltrated from a compromised gateway.

When `cnf.jkt` is present the gateway **MUST** require one of:

1. A client certificate whose SPKI thumbprint equals `cnf.jkt` (preferred; §12.4).
2. A second JWS over the request (`typ: "hallmark-pop+jws"`) binding `jkt`.

A gateway that is reachable over a transport offering neither **MUST NOT** issue
or accept `cnf`-bound passports on it, because it cannot honour the binding.
Conformance vectors `pop-required-but-absent` and `pop-key-mismatch` pin this.

### 12.4 Layer 4: dropping before execution

Signature verification is an L7 operation, which means the connection is already
established. For the "drop unidentified traffic at the TCP layer" requirement:

- **mTLS with short-lived certificates** issued against the same agent keys. The
  handshake proves key possession before any application bytes flow, so an
  unauthenticated peer is refused during the handshake rather than after a
  request is parsed.
- **Decoy routing.** Listeners without a valid client certificate are completed
  against a decoy endpoint that returns nothing. The point is not to serve a
  useful error, it is to give a scanner no signal that a service exists.
- **ALPN/SNI routing** to per-capability listeners, so an agent holding
  `vector.search.v1` physically cannot reach the inference listener.

L4 gives cheap pre-execution rejection. L7 gives per-request accountability. A
deployment **SHOULD** use both; L4 alone cannot distinguish one agent from another,
and L7 alone cannot avoid accepting the TCP connection.

---

## 13. Key lifecycle

| Phase | Requirement |
| --- | --- |
| Generation | Ephemeral Ed25519 per agent session, or HSM/TPM-resident with a non-exportable key. |
| Storage | **MUST NOT** be written to disk in plaintext by the SDK. |
| Registration | `kid` + public JWK registered against `spid` and tenant at spawn. |
| Resolution | Local, pinned. `jku`/`x5u`/`x5c` forbidden (`V1`). |
| Rotation | New key per session is preferred. Rotation mid-session requires re-issuance. |
| Retirement | Expiry; explicit revocation is for compromise, not hygiene. |

Sub-agent keys **SHOULD** be single-use. A reusable sub-agent key is a key whose
blast radius is the sum of every session it ever signed — the precise failure
mode §10.5 exists to bound.

---

## 14. Audit log

Every verification outcome, including rejections, emits an event:

```json
{ "ts": 1772323200123, "event": "passport.rejected",
  "code": "HLM_4006", "reason": "lineage_human_changed",
  "tid": "tnt_acme", "session": "ses_gc_0004", "depth": 3,
  "human": "usr_4471", "spid": "spid://acme/summarizer-01",
  "attestation": "at_0001", "key": "ed25519:...", "method": "POST", "path": "/v1/chat/completions" }
```

The log is **append-only and hash-chained** using the same Seal construction, with
per-interval Merkle roots. Roots are timestamped via RFC 3161 or anchored to a
public transparency log (Sigstore/Rekor), so an operator who controls the log
still cannot retroactively alter history without detection.

Rejections are logged with the same fidelity as acceptances. An audit trail that
only records successes cannot answer "did anyone try to forge lineage from this
compromised host," which is usually the first question asked.

---

## 15. SDK and MCP integration

The SDK exposes a delegation primitive. Over MCP this is a tool:

```json
{ "name": "hallmark_delegate",
  "arguments": {
    "spid": "spid://acme/summarizer-01",
    "caps": ["llm.inference.v1"],
    "budget": { "req": 40, "tin": 4194304, "tout": 262144, "cost": 1500, "conc": 1 },
    "ttl": 60, "prof": "llm.chat.default.v1"
  } }
```

**The SDK is the enforcement point for §8.3 step 2.** It is also the weakest
link: an agent that talks to the model directly, without the SDK, has no
`azp`/`ln`/`budget` and is simply unrecognizable traffic — which the gateway
drops. That is the correct outcome and is the reason the design does not depend on
the agent being honest.

The MCP server must run in the agent's trust boundary and **MUST NOT** accept
budget or capability requests that exceed the parent's, mirroring `L10`/`L12`
server-side. Client-side checks in a tool call are a usability feature, not a
control.

---

## 16. Verification procedure

Normative order. A gateway **MUST** execute these in order and **MUST NOT** forward
a request until all pass. The order is chosen so that cheap, high-selectivity
checks reject the common cases first.

| Step | ID | Check | Failure |
| --- | --- | --- | --- |
| 0 | — | Passport ≤ `maxPassportBytes` (4096) | HLM_1005 |
| 1 | **V1** | `alg` in allowlist; `typ` matches; no `jku`/`x5u`/`x5c`; `crit` understood | HLM_1002 / HLM_1004 / HLM_1005 |
| 2 | **V2** | Signature verifies over the signing input; header and payload are canonical with no duplicate members | HLM_1003 / HLM_1005 |
| 3 | — | Claim shape and types valid; `hlm.v == 1` | HLM_1005 |
| 4 | — | Policy `id@v` is known | HLM_1005 |
| 5 | **V8** | Revocation manifest fresh (§10.4); key, session, tenant not revoked | HLM_6001–6004 |
| 6 | **V3** | `nbf ≤ now < exp`; `iat` not in the future; `exp - iat ≤ min(maxTtlSec, policy.maxTtlSec)` | HLM_2001–2003 |
| 7 | **V4** | `aud` contains this gateway; `hlm.tid` matches | HLM_3001 / HLM_3002 |
| 8 | **V6** | `jti` unseen; `sqn` above the window floor | HLM_2004 / HLM_2005 |
| 9 | **V10** | Proof of possession if `cnf` present | HLM_8001 / HLM_8002 |
| 10 | **V5** | Attestation known, not revoked, seal matches `root.h`, `cnf.jkt` binds the chain root signer, tenant and `azp` agree | HLM_4002 / HLM_6003 / HLM_4006 |
| 11 | **V7** | Lineage: L1–L13, plus §8.5 edge walk | HLM_4xxx |
| 12 | — | `depth ≤ min(maxDepth, policy.maxDepth)` | HLM_5004 |
| 13 | **V9** | Route authorized by ≥1 held capability; budget available | HLM_5002 / HLM_7001 / HLM_7002 |
| 14 | — | Append audit event | — |

`V5` (step 10) is the binding between the presented passport and the human: it is
what makes `azp` a verified fact rather than a self-asserted string, and it is the
only step that consults the attestation store. Steps 0, 3, 4, 12 and 14 are
unnamed because they are hygiene rather than security boundaries.

Note that revocation (step 5) is checked *before* the lineage walk (step 11)
despite being listed later in the threat model. A revoked key should not cost a
lineage traversal, and a revoked agent should never reach the point where the
gateway is reasoning about its authority.

### 16.1 Error registry

`HLM_<class><n>`. Classes: 1 format/signature, 2 time/replay, 3 binding, 4 lineage,
5 budget, 6 revocation, 7 authorization, 8 proof of possession.

| Code | Reason | HTTP |
| --- | --- | --- |
| HLM_1001 | `unknown_kid` | 401 |
| HLM_1002 | `unsupported_alg` | 401 |
| HLM_1003 | `bad_signature` | 401 |
| HLM_1004 | `bad_type` | 401 |
| HLM_1005 | `malformed` | 401 |
| HLM_2001 | `expired` | 401 |
| HLM_2002 | `not_yet_valid` | 401 |
| HLM_2003 | `ttl_exceeds_max` | 401 |
| HLM_2004 | `replay_detected` | 401 |
| HLM_2005 | `sequence_invalid` | 401 |
| HLM_3001 | `audience_mismatch` | 401 |
| HLM_3002 | `tenant_mismatch` | 401 |
| HLM_3003 | `parent_required` | 401 |
| HLM_4001 | `lineage_depth_invalid` | 403 |
| HLM_4002 | `lineage_root_mismatch` | 403 |
| HLM_4003 | `lineage_seal_mismatch` / `lineage_window_not_ancestor` | 403 |
| HLM_4004 | `lineage_prefix_mutated` | 403 |
| HLM_4005 | `lineage_issuer_mismatch` | 403 |
| HLM_4006 | `lineage_human_changed` | 403 |
| HLM_4007 | `lineage_tenant_mixed` | 403 |
| HLM_4008 | `lineage_audience_widened` | 403 |
| HLM_4009 | `lineage_cycle` | 403 |
| HLM_4010 | `lineage_session_reused` | 403 |
| HLM_4011 | `edge_unregistered` | 403 |
| HLM_4012 | `profile_not_narrowed` | 403 |
| HLM_5001 | `budget_inflated` | 403 |
| HLM_5002 | `budget_exhausted` | 429 |
| HLM_5003 | `budget_overlap` | 403 |
| HLM_5004 | `budget_depth_exceeded` | 403 |
| HLM_6001 | `key_revoked` | 403 |
| HLM_6002 | `session_revoked` | 403 |
| HLM_6003 | `attestation_revoked` | 403 |
| HLM_6004 | `revocation_set_stale` | 503 |
| HLM_7001 | `route_not_authorized` / `capability_unknown` | 403 |
| HLM_7002 | `method_not_allowed` | 405 |
| HLM_8001 | `pop_missing` | 401 |
| HLM_8002 | `pop_key_mismatch` | 401 |

Distinguishing 401 from 403 matters operationally: 401 means the *credential* is
bad and retrying with the same one is pointless; 403 means the credential is
authentic but not *permitted*, which is a policy problem.

---

## 17. Performance budget

Measured, not estimated — `node bench.mjs` on the conformance vector set, a
1314-byte depth-3 passport, Node v24 on x86-64.

| Operation | Cost |
| --- | --- |
| Ed25519 signature verify | 94.7 µs |
| JCS canonicalize payload | 11.1 µs |
| SHA-256 over signing input | 2.0 µs |
| `seal()` incl. domain separation | 4.7 µs |
| JWK thumbprint | 3.2 µs |
| Local `kid` → JWK lookup | 0.03 µs |
| **Subtotal** | **~116 µs** |
| Spawn-edge walk, depth 16 | 0.19 µs (11.8 ns/hop) |
| **Total crypto + lineage** | **~116 µs** |

That is **~2.3% of a 5 ms budget**, leaving the overwhelming majority for TLS,
the upstream call, and queueing. Ed25519 verify is ~82% of the cost and the
obvious optimization if that ever stops being true: cache verification per
`(kid, sqn)` and skip re-verification of a byte-identical re-presented passport,
at the cost of holding state across requests.

Two caveats on these numbers. Ed25519 verify here is slower than a
hardware-accelerated implementation typically achieves (~50 µs); a Go gateway
using `filippo.io/edwards25519` with AVX2 should do materially better, so the
table is the pessimistic case. And these are means, not tails — G2 is a latency
claim, so a p99 must be measured on the target hardware before any SLO is
published. Do not quote §17 as a service-level objective.

---

## 18. Conformance

### 18.1 Levels

| Level | Requires | Suits |
| --- | --- | --- |
| **L1** | `V1`–`V3`, `V4` | Internal proxies, low-value read-only traffic |
| **L2** | L1 + `V8` revocation with freshness, audience and tenant pinning | General production |
| **L3** | L2 + `V7` lineage, `L10` budgets, `V9` route authorization | The stated product: enforcement, not just authentication |
| **L4** | L3 + L4 mTLS/decoy enforcement, PoP, audit export | Full zero-trust claim |

Marketing the product as "zero-trust" while shipping L1 would be false. L3 is the
floor for the claims in the product brief; L4 is what makes the TCP-layer
language in that brief literally true.

### 18.2 Suite

`node vectors.mjs` — 38 vectors, 4 design properties, 4 enforcement points; exits
non-zero on any mismatch. 6 positive (accept), 32 negative (each pinned to an
exact error code).

Coverage by class: signature forgery, `alg` downgrade and HS256 confusion, type
confusion, remote key resolution, unknown key, duplicate JSON members,
non-canonical encoding, expiry, TTL ceiling, audience and tenant mismatch, PoP
present/absent/mismatched, rogue attestation reuse, human swap mid-chain, budget
inflation, capability escalation, audience widening, unregistered spawn edge,
ancestry splicing, self-reference, session reuse, depth ceiling, route and method
authorization, replay, key/session/attestation revocation, stale revocation set,
untrusted IdP.

The four enforcement points cover rules that do not fire on the request path and
would therefore be untested by request vectors alone:

| Check | Asserts |
| --- | --- |
| `budget-overlap-refused` | A second slice that would overlap an existing one is refused |
| `root-cap-survives-lying-parent` | A parent that overstates its own remainder still cannot commit past the root cap |
| `budget-exhausted-on-observed-usage` | Charging uses observed usage, not an estimate |
| `slices-are-not-shared` | One session cannot exhaust another's slice |

The four design properties cover the cryptographic foundations the vectors rely
on but cannot express individually: `seal-excludes-signature`,
`jcs-member-ordering`, `seal-is-canonicalization-sensitive`,
`seal-domain-separation`.

Keys in `fixtures/keys.json` are published test keys. They sign nothing but
vectors. `make-keys.mjs` regenerates them.

### 18.3 Reproducibility

Header segments, payload segments, every Seal, every verdict and every error code
are byte-stable across runs. **ES256 signature octets are not** — P-ECDSA uses a
random `k`. This is expected, and §6.3 explains why the Seal covers the signing
input rather than the signature; property `seal-excludes-signature` asserts it
directly. Any implementation can therefore reproduce this suite by comparing
signing inputs, not whole tokens.

---

## 19. Worked example

Frozen clock `CLOCK = 1772323200` (2026-03-01T00:00:00Z), tenant `tnt_acme`, human
`usr_4471`, policy `pol_acme_default@7`.

```
1. usr_4471 authorizes key K_root via passkey
   -> attestation at_0001, cnf.jkt = thumbprint(K_root)
      seal = 7_WbcECGm3l0o59veVbPT0MxRmqagZaqZp1hNMsanLU

2. root agent signs passport with K_root
   ln = [ {sid: at_0001, h: 7_Wbc...} ]              depth 1
   seal = ZTsj644aFvFqS0RI5-Yk0cyLujeQuch00Td-WB6v7sE
   edge: ses_root_0001 -> (attestation at_0001)

3. worker-07 signs with K_a, spawned by root
   ln = [ {at_0001, 7_Wbc...}, {ses_root_0001, ZTsj...} ]        depth 2
   seal = XZR-d3zyyRsoV1cmpz0bJvAfuGIt9bEn91EE4eAlDaY
   edge: ses_child_0002 -> (ses_root_0001, tip ZTsj...)

4. summarizer-01 signs with K_b, spawned by worker-07
   ln = [ {at_0001, 7_Wbc...}, {ses_root_0001, ZTsj...}, {ses_child_0002, XZR-...} ]
   depth 3, budget req 40 / cost 1500 / depth 0 / wid 0

   Gateway receives only the leaf. anchor() walks:
     idx 2: edge[ses_gc_0004] -> parent ses_child_0002, tip XZR-...   OK
     idx 1: edge[ses_child_0002] -> parent ses_root_0001, tip ZTsj... OK
            rootAt/rootH match ln[0]                                 OK
     rootSignerJkt = thumbprint(K_root) == attestation.cnf.jkt      OK
     -> azp = usr_4471 is now a verified fact, not a claim.
```

A depth-3 agent's entire human provenance has been re-established in ~0.19 µs of
lookups plus one Ed25519 verification, with no ancestor token on the wire.

---

## 20. Repository map

| Path | Purpose |
| --- | --- |
| `Hallmark-Agent-Identity-Spec.md` | This document. Normative. |
| `README.md` | Orientation and status. |
| `test-vectors/hallmark-ref.mjs` | Primitives: JCS, Seal, thumbprints, JWS, revocation, replay, allocation. |
| `test-vectors/verify.mjs` | Edge registry, minting, `verifyPassport()`, invariants L1–L13. |
| `test-vectors/vectors.mjs` | Vector generation and self-test. |
| `test-vectors/bench.mjs` | Hot-path measurement behind §17. |
| `test-vectors/vectors.json` | Generated vectors and pass/fail verdicts. Do not hand-edit. |
| `test-vectors/fixtures/keys.json` | Published test keys. Do not reuse. |
| `test-vectors/make-keys.mjs` | Regenerates the key fixtures. Run once. |
| `crosscheck.mjs` | Asserts the spec and the reference agree: every `V#`/`L#`/`T#`/`HLM_#` cited is defined, every code the implementation can throw is documented, every cross-reference resolves. |

```bash
npm test              # vectors + crosscheck; non-zero exit on any failure
npm run vectors       # regenerate vectors and self-test
npm run bench         # performance numbers behind §17
```
`crosscheck.mjs` exists because spec drift is invisible to tests: the reference
implementation can drift from the document, or the document from the
implementation, and neither is a behavioural bug. It is the check that keeps the
two honest with each other.

---

## 21. Open questions for review

1. **`azp` as a raw OIDC subject.** Correct for cross-tenant portability, but it
   is PII. Should the default be an opaque, tenant-scoped pseudonym with the
   mapping held only by the control plane? This is a privacy/compliance decision
   with no obviously right answer, and it should be made before the SDK ships.
2. **`sqn` semantics under multi-key agents.** An agent that rotates keys mid-session
   gets a fresh counter and a replay window. Is a per-*agent* counter keyed on
   `spid` instead worth the coordination?
3. **Revocation propagation target.** 30 s staleness is a policy default, not a
   technical limit. What is the honest p95 the push channel can actually
   deliver, and should the spec mandate a number?
4. **Depth-1 passports at the gateway.** A root agent's passport is verified
   against a locally cached attestation. Should gateways instead require the
   attestation to be presented on every request, trading ~1 KB and one ES256
   verify for removing a cache-trust assumption?
5. **Is `hlm.depth` worth keeping?** It is fully derivable from `hlm.ln.length`.
   It is currently a checked redundancy and a tripwire, but it is also ~15 bytes
   per passport and a second thing to get right.
