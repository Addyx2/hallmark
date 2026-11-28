# Hallmark Product Family — the six products, one loop

**Status: DESIGN NOTE — product components designed only, not implemented. Not normative.**
Vocabulary companion to `Seal-v2-Design.md` and v1 `Hallmark-Agent-Identity-Spec.md`.
Everything here rides the v1 core (attestation, lineage, grants-as-passports, audit).
The product family is one closed loop: user leash → agent imprint → provider gate →
grant → action → trackline event → leash view.

---

## 0. The one sentence

Hallmark is the user's leash, Imprint is the responsibility sticker, Grants are
computed authorizations, Barricade enforces, Freeroam observes, Trackline
reports — five products and one protocol, all on the verified v1 rails.

## 1. Roles

| Role | What it is | Holds |
| --- | --- | --- |
| The user | a human; owns agents | the leash (Hallmark account) |
| The agent | from any provider — third-party agents, in-house agents or lab agents | an Imprint, grants |
| The provider | a service/commerce surface agents visit | Barricade or Freeroam, a `barricade-policy` |
| The platform | the rails between all three | attestation, lineage, grants, audit |

The strategic position: agents are commodity, the leash is the switching cost,
and the leash is **vendor-neutral by construction** — a user running agents from
different providers needs one leash for them all or the grants never reconcile.
Meta and OpenAI each want to own the agent control plane; neither can,
neutrally. The defensible layer under the leash is the protocol: every agent
wears the same Imprint, every provider accepts the same Grant, every authorized
action lands in the same audit.

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
  action proceeds. Barricade walls the first responsible action, never first
  contact, and only on signed responsible-action surfaces.
- **T2** — elevated: liveness / passkey re-assertion on demand for high-value
  or policy-gated actions.

### 2.2 Imprint — the sticker
Responsibility attached to an agent at enrollment, never detachable, unspoofable
by construction: v1 lineage (L1–L13) requires a single `root.sub`. Every action
carrying a valid Hallmark passport resolves to one responsible human. The user
can ask "which descendant did this?" and get a provable answer. Traffic with no
valid passport remains unattributed; this is not bot detection.

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
The same gate with the denial removed: identification of cooperating agents and
telemetry only, no enforcement. **Honest bounds:** agents that present an
Imprint in the protocol request header are attributed exactly. Non-cooperating
agents remain unattributed. Freeroam deliberately does not fingerprint them and
does not build evasion detection or an anti-bot classifier. "Identify yourself"
is the cooperative norm the market is demanding (Web Bot Auth, Trusted Agent
Protocol) and the defensible side of the line.

Freeroam is the wedge: observation sells visibility → insight converts provider
to Barricade → grants monetize.

### 2.6 Trackline — feedback
The agent-to-user event feed: signed `hallmark+trackline-event` records —
what the agent did, cost, merchant, grant `jti` ref, budget remaining. These are
designed to mirror **the v1 §14 audit log** (specified, not implemented):
an append-only log with a signed fan-out to the user's inbox. Trackline is the leash's feedback loop and
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

## 4. Built vs designed

| Layer | v1 state |
| --- | --- |
| v1 primitives: attestation, lineage L1–L13, revocation, replay, budgets, caps | built and vector-tested in the spec reference |
| audit log (§14) | specified, not implemented |
| gate pipeline V1–V10 | partially implemented in the draft provider harness (Freeroam observe, Barricade enforce); not a full gateway |
| grants as passports (cap + budget + jti) | primitives built and vector-tested; the leash that mints them is designed only |
| Hallmark leash, Imprint, Barricade product policy, Trackline | designed only; not built as products |

Designed only, not built — each wants its own spec shape:

1. **Cooperative agent identity signal** — the protocol header: an imprinted
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
problem behind large-platform agent commerce disputes). The provider is the
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
3. **Freeroam legal framing** — keep the scope cooperative-only. Non-cooperating
   agents remain unattributed; Freeroam deliberately does not fingerprint or
   build evasion detection, and detection heuristics stay out of scope.
4. **Barricade policy authorship** — human-configured per provider, or minted
   through a marketplace so providers can adopt a baseline policy in one click?