# Seal v2 — Ownership Seals on Original Works

**Status: DESIGN NOTE — reviewed, not implemented. Not normative.**
Companion to `../Hallmark-Agent-Identity-Spec.md` (cited below as v1 `§N`).
No v1 change is required for this design; it is a new claim type verified by the
existing v1 pipeline. The name "Seal" is deliberately reused: v1 Seal fingerprints
*identity provenance*, v2 Seal fingerprints *artifact ownership*. Same fingerprint
family, different subject.

---

## 1. What it is

A signed manifest — `typ: "hallmark+work"` — attached to any **original work** a
human creates, directly or through agents they own. The signature terminates,
through the v1 lineage chain, at a responsible human (`root.sub`). From this one
design rule everything else follows:

> **Invariant L14.** For a sealed work, the `owner` and the responsible human in
> the signing chain are the same value.

Ownership and responsibility are not two claims that must agree; they are one.

Scope that this deliberately covers, per product decision:
- works a human makes directly (text, image, audio, video, code, designs);
- works an agent makes on a human's behalf (the agent's lineage makes the human
  the effective author — the Imprint);
- derivative works, where `derivations` names the source works (see §7).

## 2. The honest constraint — read this before the schema

A seal **cannot prevent copying.** Anything rendered to a human can be leaked;
the entire history of DRM is the proof that prevention fails and then taxes
legitimate users harder than pirates.

What a seal *does* buy, and this is the actual product:

| Capability | Mechanism |
| --- | --- |
| Proof of authorship & ownership | signed manifest, hash-bound to the artifact |
| Provable misappropriation | audit row on every authorized use (v1 §14 reuse) |
| One-call licensed use | Barricade answers *yes / no / pay-here* |
| Enforceable payment | rights registry is the coercive point, payment rail after it |

The registry is where "so it's not used without permission or payments" becomes
real: it is the single place ownership is resolved, terms are enforced, and money
moves. The seal makes misuse *detectable and attributable*, not impossible.

## 3. Manifest — `typ: "hallmark+work"`

JWS compact serialization, same envelope conventions as v1 §6.1. Header carries
`{ alg, typ, kid }`; the signing key is **an imprinted key** — either the human's
root key, or an agent key that resolves to the human through v1 §8 lineage.
The `root` block is copied into the manifest so the claim is verifiable offline
without fetching anything (mirrors v1 §7.2).

```json
{
  "iss": "ses_child_0002",                  "-- signing session (agent) or root key id",
  "sub": "ses_child_0002",
  "wid": "wrk_0001",
  "jti": "wrk_0001",
  "iat": 1772323200, "nbf": 1772323200, "exp": 1772409600,
  "hlm": {
    "schema": 1,
    "content": {
      "kind": "image",                      "-- media category; registry facet",
      "hash": "BASE64URL(SHA-256(artifact_bytes))",
      "bytes": 482913                        "-- size, cheap integrity assist"
    },
    "license": {
      "uri": "https://lc.acme/lic/cc-by-nc-4.0",
      "terms_hash": "BASE64URL(SHA-256(JCS(terms)))"
    },
    "owner":  "usr_4471",                    "-- must equal root.sub (L14)",
    "payee":  { "addr": "0x…", "rail": "adatum" },
    "derivations": [                          "-- source works, if any (§7)",
      { "wid": "wrk_4000", "relation": "derived_from" },
      { "wid": "wrk_4001", "relation": "trained_on" }
    ],
    "basis_known": true,                      "-- explicit basis assertion (§7)",
    "root": { "at": "at_0001",
              "h": "7_WbcECGm3l0o59veVbPT0MxRmqagZaqZp1hNMsanLU",
              "iss": "https://idp.acme.example/",
              "sub": "usr_4471" }
  }
}
```

Notes:
- `wid` is the registry key. `content.hash` binds the manifest to the exact
  artifact bytes; swap the artifact and the seal breaks (§8).
- `license.terms_hash` lets the registry and the payer compare *terms agreed to*
  against *terms asserted*, without trusting a URL that may rot.
- `owner` vs `payee`: owner is the human (L14); payee is where money goes. They
  usually coincide; a work-for-hire seal is the case where they don't.
- The header carries `typ: "hallmark+work"` — the one discriminator the registry
  needs to route a JWS to the work pipeline instead of the passport pipeline. No
  in-payload `typ` field; the envelope convention is inherited unchanged from
  v1 §7.2, where the header, not the payload, owns the type.

## 4. Verification — reuse, don't rebuild

A seal verifies through the exact v1 §16 pipeline:

1. JWS shape, alg allowlist, canonical no-duplicates (V1, V2).
2. Lifetime, audience, replay (`jti`) — V3, V4, V6.
3. Revocation of signer key / session / tenant — V8 + v1 §10.
4. Lineage: `root` + `ln` through L1–L13 and the spawn-edge registry (v1 §8.5),
   so a stolen or invented agent key cannot seal works on someone else's behalf.
5. **L14**: `owner == root.sub`.

New failure family (not yet numbered; v1 §16.1 style):
- HLM_9xxx family, e.g. `HLM_9001` unknown license catalog id,
  `HLM_9002` `owner` != `root.sub`, `HLM_9003` content hash mismatch,
  `HLM_9004` duplicate `wid`.

## 5. The Barricade as the content-use gate

One proof, two surfaces. The gate that grants a shopping tier
(discovery → checkout → payment) also gates *use of a sealed work*:

```
authorizeUse(request_passport, target_wid):
  1. request_passport verifies via v1 §16            -- who is asking (Imprint)
  2. target seal verifies via §4                     -- who owns it
  3. license catalog lookup: terms + route
     -> yes        (catalog allows this requestor class)
     -> no         (terms deny; denied, with reason)
     -> pay_here   (terms priced: quote -> pay -> yes)
     -> escalate   (human decision required)
  4. on yes: mint a USE TOKEN; log the row (v1 §14)
```

**The use token is a v1 passport.** `caps: ["content.use"]`,
`aud: <registry>`, fresh `jti`, and a v1 `budget` envelope spent on observed
usage, minted by the registry. It is not a new token type — it is the same
mint-with-capability the shopping path uses. That is the whole point of the
reuse: the platform has *one* currency of authorization.

Every authorized use is appended to the audit log (v1 §14), which is what makes
later misappropriation *provable* ("content appeared in X's dataset; no use token
was ever minted to X's lineage").

## 6. Registry and payment

- **Register(seal)**: verifies as §4, runs a near-duplicate check on
  `content.hash` (exact for text/logs; perceptual hash for media in v2.1), then
  appends to the append-only log (v1 §14 reuse). Rejection paths per §4.
- **Resolve(wid)** → `{ owner, license, payee, first_seen, lineage_root }`.
  This is the public coercion point: anyone can verify, anyone can pay, no one
  can erase an ownership claim.
- **Payment interface, not vendor**: `quote → escrow → settle → mint use token`.
  AP2 / Stripe / stablecoin rails plug into the same interface. The registry is
  where the platform earns its margin (per-transaction, on quote or settle).

## 7. The derivation problem (AI training) — honest by design

An agent's output is often built on inputs whose lineage nobody knows. The seal
handles this with an *explicit* assertion rather than silence:

- `basis_known: false` is a legal, first-class value meaning *"the creator does
  not know the training basis"* — not an error. `basis_known: true` with an
  empty `derivations` is forbidden (L16), forcing the creator to name a source,
  a search, or state basis honestly.
- The registry keeps an **obligation ledger** per source work: when a
  downstream work seals against `derivations`, an obligation row is appended to
  each named source's `wid`. Payments and disputes then walk real edges, not
  lawyers' guesses.

> **Invariant L16.** `basis_known: true` XOR non-empty `derivations` is
> unsatisfiable — a claim must pick honest-unknown or name its sources.

This is explicitly *not* the "solve worldwide training-license confusion"
ambition. It is: make every work's claim about its basis a signed, auditable
fact, and let the obligations accrue where the graph actually has edges.

## 8. Attack surface to design against

| Attack | Why it fails |
| --- | --- |
| Seal someone else's work with your key | Lineage: signer must be an imprinted key whose human raises to the owner of record (L14). A random human's seal over another's artifact still *copies* it — near-dup registration rejects (or flags) the copy. |
| Swap artifact bytes after sealing | `content.hash` binding (HLM_9003, new). Container-level: registry re-hashes on resolve. |
| Replay a seal under a new `wid` | `jti` replay cache (V6) + `wid` uniqueness check (HLM_9004). |
| Rot the `license.uri` to change terms | `terms_hash` binds claimed terms; registrar signs the catalog snapshot. |
| Use without a token, at scale | Detectable by audit gaps; the *provable* part is the registry's signed log, not the platform's word. |

One honest gap: v1 key custody applies unchanged — a stolen **human root key**
can seal works as that human (T-series from v1 §4 all still apply). For
high-assurance works, §7.1.1 passkey binding should carry over: the seal's
challenge is a WebAuthn assertion over the manifest. Root keys never leave the
authenticator.

## 9. Open questions

1. **License value: catalog or free-form URI?** Catalog (closed set) lets the
   Barricade answer yes/no automatically; free-form legalizes anything but kills
   automation. Recommended first cut: small enumerated catalog + URL escape
   hatch, exactly like the closed `alg` allowlist in v1 §6.1.
2. **Key custody for direct human works** — humans sign with the passkey-bound
   root key (v1 §7.1.1), or is an IdP-issued short-lived key per work acceptable?
   Recommended: passkey for first cut; it is already specified.
3. **Near-duplicate registry**: exact-hash first, perceptual hash for media
   later — or in scope from day one?
4. **Fee mechanics**: margin on quote, on settle, or monthly? Model matters for
   how much Barricade must prove about a use *before* it can bill.
5. **Escalation channel**: `escalate` → the owner's inbox. First class in the
   protocol, or a UI-only affordance?

---

## Appendix A — How this closes the shopping thread

This design applies the same v1 passport mechanism to content-use licensing:
one proof, two surfaces. Both are the Barricade issuing **v1 passports as
capability tokens**:

- shopping: `caps: ["commerce.purchase.v1"]`, budget = spend envelope;
- content: `caps: ["content.use"]`, budget = usage allowance.

The Imprint answers *who* (lineage to a human), the Barricade answers *may they*
(capability + budget + revocation), the Seal answers *whose fingers are on the
artifacts*. Every action carrying a valid Hallmark passport resolves to one
responsible human. A third-party agent presents an Imprint-verified passport;
the Barricade decides; the shop or registry settles. That is the platform's
product: one proof, two surfaces, one audit log (specified in v1 §14, not yet
implemented).