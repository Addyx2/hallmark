# Hallmark Product Family — the six products, one loop

**Status: DESIGN NOTE — reviewed, not implemented. Not normative.**
Vocabulary companion to `Seal-v2-Design.md` and v1 `Hallmark-Agent-Identity-Spec.md`.
Everything here rides the v1 core (attestation, lineage, grants-as-passports, audit).
The product family is one closed loop: user leash → agent imprint → provider gate →
grant → action → trackline event → leash view.

---

## 0. The one sentence

Hallmark is the user's leash, Imprint is the responsibility sticker, Grants are
computed authorizations, Barricade enforces, Freeroam observes, Trackline
reports — five products and one standard, all on the verified v1 rails.

## 1. Roles

| Role | What it is | Holds |
| --- | --- | --- |
| The user | a human; owns agents | the leash (Hallmark account) |
| The agent | from ANY provider — Muse, Instinct, their own, the labs | an Imprint, grants |
| The provider | a service/commerce surface agents visit | Barricade or Freeroam, a `barricade-policy` |
| The platform | the rails between all three | attestation, lineage, grants, audit |

The strategic position: agents are commodity, the leash is the switching cost,
and the leash is **vendor-neutral by construction** — a user running Muse and
Instinct needs one leash for both or the grants never reconcile. Meta and OpenAI
each want to own the agent control plane; neither can, neutrally. The defensible
layer under the leash is the standard: every agent wears the same Imprint, every
provider accepts the same Grant, every action lands in the same audit.

## 2. The products

### 2.1 Hallmark — the leash
The user-facing control surface. Add agents from different providers, stick
Imprints on them, dial budgets, issue and revoke grants, kill-switch a lineage,
and see Trackline. Enrollment is a **minting ceremony, not a signup wall**
(v1 §7.1.1): connect the session that already proves who you are (any OIDC —
Meta, Google, Apple) plus one WebAuthn presence tap → root attestation minted.
Signup-as-account is forbidden; signup-as-attestation is the product.

Tiers against the funnel:
- **T0** — guest imprint-lite: provider has verified an agent operator, no
  personal user identity. Discovery, read-only, zero spend.
- **T1** — enrolled at the moment of first *responsible* action: purchase,
  content-use license, destructive op. The provider's gate offers
  "continue with Hallmark"; the agent prompts the user; one tap enrolls; the
  action proceeds. Wall the first responsibility, never first contact.
- **T2** — elevated: liveness / passkey re-assertion on demand for high-value
  or policy-gated actions.

### 2.2 Imprint — the sticker
Responsibility attached to an agent at enrollment, never detachable, unspoofable
by construction: v1 lineage (L1–L13) means every agent terminates at exactly one
human (`root.sub`). The user can ask "which descendant did this?" and get a
provable answer.

### 2.3 Grants — computed authorization
Authentication answers "who are you?" once and forever; a Grant is a
**computation**: lineage verified + capability checked + budget bound + action
bound + lifetime + `jti`, recomputed per action. It replaces re-authentication
with near-free computation — the measured `verifyPassport` path is ~116µs, ~2.3%
of a 5ms budget. Authentication is a fact you hoard; a Grant is a computation
you spend. The leash emits grants; providers consume them; Trackline reports what
they paid for.

### 2.4 Barricade — enforce
Provider-side gate. Two questions, two gates:

1. **Identity gate** — does the agent wear an Imprint? (who is responsible)
2. **Authorization gate** — does this exact action carry a Grant? (may it)

The provider sets scope per surface: **entire site / features / payments /
actions**, and per tier (imprint-only vs grant-required). That scope is a first
spec-shaped artifact: claim type `hallmark+barricade-policy` — surfaces × gates
× tiers, signed by the provider. On denial it emits the v1 HLM error family; on
grant it mints the use token and appends the audit row.

### 2.5 Freeroam — observe
The same gate with the denial removed: agent identification + telemetry only,
no enforcement. **Honest bounds:** cooperating agents (wearing an Imprint in a
standardized request header) are tracked exactly; non-cooperating agents are
best-effort fingerprinting, and that is the anti-bot arms race Amazon is
currently litigating (CFAA). Build the cooperative-identity signal, not the
evasion-detector. "Identify yourself" is also the exact norm the market is
demanding (Amazon's stated conditions, Web Bot Auth, Trusted Agent Protocol) —
it is both the CFAA-safe side of the line and the marketable one.

Freeroam is the wedge: observation sells visibility → insight converts provider
to Barricade → grants monetize.

### 2.6 Trackline — feedback
The agent-to-user event feed: signed `hallmark+trackline-event` records —
what the agent did, cost, merchant, grant `jti` ref, budget remaining. These are
**the same rows as the v1 §14 audit log**, productized: the append-only log with
a signed fan-out to the user's inbox. Trackline is the leash's feedback loop and
the receipt surface. It also makes misappropriation provable ("this content
entered X's dataset; no grant was ever minted to X's lineage").

## 3. The closed loop

```
action fires ─▶ provider gate (Barricade/Freeroam)
     imprint check ──▶ no ──▶ T0 explore ──or── elevate: "continue with Hallmark"
     grant check  ──▶ no ──▶ escalate to user (bound challenge over exact facts)
     user presence tap ─▶ grant minted ─▶ agent acts
     trackline event ─▶ user inbox ─▶ leash view (budget spent, kill-switch)
     audit row appended (v1 §14) ─▶ provable later
```

Agent never holds authority — only a request and a short-lived grant. The
authentication terminates at the gate, not at the agent, otherwise a compromised
agent MITMs the proof.

## 4. Already built vs genuinely new

| Layer | v1 state |
| --- | --- |
| attestation, lineage L1–L13, revocation, replay, budgets, caps | built, vector-tested |
| audit log (§14) | built and mirrored by Trackline |
| the gate pipeline V1–V10 | built; Barricade = enforce mode, Freeroam = observe mode |
| grants as passports (cap + budget + jti) | built; the leash just mints them |

Genuinely new, wants its own spec shape:

1. **Cooperative agent identity signal** — the header standard: an imprinted
   agent declares itself (imprint/grant reference) to every provider it visits.
   Freeroam's exactness and Barricade's identity gate both depend on it. Also
   the market norm ("identify yourself") and the CFAA-safe alternative to
   evasion detection.
2. **`hallmark+barricade-policy`** claim — provider scope: surfaces × gates ×
   tiers, signed, resolvable, auditable.
3. **`hallmark+trackline-event`** claim — signed receipt feed contract.
4. **Enrollment protocol** — T0→T1→T2, mint-from-existing-session, passkey.

## 5. Provider economics — the honest part

An agent that shops cleanly never sees the provider's ad surfaces (the $68B
problem behind the Amazon–Muse / Amazon–Perplexity fights). The provider is the
payer, so Barricade's fee must make providers whole on **transaction value** —
per verified/spent grant — not an ad-equivalent per-impression tax. Grants + the
payment rail are the revenue product; Freeroam + Trackline are retention.

## 6. Sequencing

Freeroam (observe, zero friction, sells visibility)
→ Barricade imprint-gate (needs the enrollment base Freeroam built)
→ Grants (needs merchants + a payment rail)
→ Trackline (retention + the leash's feedback, closes the loop)

Each step creates the adoption base the next one requires.

## 7. Open questions

1. **Pricing mechanics** — per-grant, per-tx %, monthly SaaS for the provider's
   barricade surface? Fee model decides how much the gate must *prove* before
   billing (v1 already computes the evidence; the rate-card differs).
2. **Who owns Trackline** — the operator (agent-provider) or the leash (user)?
   It affects whether the feed is an agent obligation or a user entitlement.
3. **Freeroam legal framing** — observation of non-cooperating agents carries
   CFAA/ToS exposure. Decide the cooperative-only scope explicitly before
   building detection heuristics that drift.
4. **Barricade policy authorship** — human-configured per provider, or minted
   through a marketplace so providers can adopt a baseline policy in one click?