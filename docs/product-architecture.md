# Pascaal product architecture

**Status: design architecture for the console UI preview.** This document
describes the target product. The current `apps/console/` build is a static UI
with mocked data: no real authentication, no database, no API keys, no billing
and no hosted registry.

The pattern is a developer console with organizations, roles, projects, scoped
keys, agents, grants, traffic, receipts, usage and agent-readable docs in one
place. For Hallmark, the console is the human side of the loop: a human owns
agents, grants authority, watches receipts, and stops a lineage.

---

## 1. Surfaces

| Surface | Hosted target | Current preview |
| --- | --- | --- |
| Console UI | `console.pascaal.com` | `apps/console/` static demo |
| Marketing site | `pascaal.com` | live |
| Protocol site | `hallmark.pascaal.com` | live |
| Provider SDKs | npm `@pascaal/*` | staged, publish pending scope |
| Provider demo + control room | local `examples/provider-demo` | live locally |
| Agent-readable docs | `/llms.txt`, `/llms-full.txt`, `/agent/` | in console preview |

The console is **not** the protocol. The normative source remains
[`spec/Hallmark-Agent-Identity-Spec.md`](../spec/Hallmark-Agent-Identity-Spec.md).

## 2. Identity model

### Human identities

A human signs in with OIDC or WebAuthn. Email/password is only a bootstrap
convenience; WebAuthn should become the default for owners because these keys
control agent authority.

Target entities:

- `User` — one human, one or more identities, verified email.
- `Session` — short-lived browser session, refresh token in an httpOnly cookie.
- `Organization` — the billing and permission boundary.
- `Membership` — `User × Organization × role`.
- `Role` — `owner`, `admin`, `developer`, `viewer`.
- `Invitation` — email + role + expiry + single-use token.

### Machine identities

- `Project` — belongs to an organization; carries a `tenant` (`hlm.tid`) and an
  audience (`aud`) for the gateway.
- `ApiKey` — belongs to a project, has a prefix, scopes, environment, created
  time, last-used time, and revocation state.
- Key secret is shown **once**. The database stores only a hash and a
  non-secret prefix.
- Keys are scoped, for example `freeroam:observe`, `barricade:enforce`,
  `grants:mint`, `registry:read`.
- Keys are pinned locally; no URL or remote discovery. `jku`, `x5u` and `x5c`
  stay forbidden by spec.

### Isolation rule

Every read and write is scoped by `organization_id` first, then `project_id` /
`tenant`. A request that cannot prove both boundaries fails closed with a
generic not-found or auth error. There is no global admin list that bypasses
scoping without an audited break-glass flow.

## 3. Data model

| Entity | Purpose |
| --- | --- |
| `Organization` | Permission and billing boundary |
| `Membership` | Role of a user in an organization |
| `Project` | Tenant + audience + environment for one integration |
| `ApiKey` | Scoped machine credential |
| `Imprint` | Root attestation bound to a human and an agent key |
| `Agent` | SPID, name, capabilities, current imprint |
| `Grant` | Short-lived, per-action authority; `jti`, `sqn`, budget, expiry |
| `RevocationManifest` | Versioned, fresh denylist for keys/sessions/attestations/tenants |
| `TracklineEvent` | PII-redacted receipt with pinned `HLM_` codes |
| `TrafficObservation` | Freeroam observation of cooperative agent traffic |
| `UsageRecord` | Metered observed/enforced events for billing |
| `Invoice` | Plan + usage period + amount |
| `AuditLog` | Human actions: invites, key changes, revocations, role changes |

`Grant` and `TrafficObservation` are deliberately separate. A visit is an
observation; a grant is authority for a responsible action.

## 4. Console flows

### 4.1 Signup and login

1. Visitor chooses **Create account**.
2. Email + WebAuthn enrollment (or email magic link as bootstrap).
3. Organization is created with the user as `owner`.
4. A first project is created with a generated tenant and audience.
5. Session cookie is set; a welcome receipt is written to `AuditLog`.

The preview simulates this with local state only. No password is sent or
stored.

### 4.2 Organizations and roles

- Owner can invite, change roles and remove members.
- Admin can manage projects, keys and policies.
- Developer can read receipts and rotate keys, but cannot change billing.
- Viewer can read dashboards only.
- Role changes and invitations are audited.

### 4.3 Projects and API keys

1. Create a project: name, environment, `tenant`, `audience`.
2. Create a key with explicit scopes.
3. Display the secret once with a copy action.
4. Store only prefix + hash.
5. Revoke immediately; propagation to gateways follows revocation freshness.

### 4.4 Agents, grants and revocation

- List agents by SPID and imprint.
- Show active grants, sequence numbers and remaining budgets.
- Revoke one session (one grant) or kill a lineage (root attestation + all
  descendant sessions).
- Every control writes a Trackline event and an audit entry.

### 4.5 Freeroam traffic intelligence

Freeroam is the adoption wedge. A platform can add Freeroam to any web surface it operates.
Cooperative agents self-identify, and the console shows:

- attributed vs unattributed requests,
- agent SPID, route and method,
- observed usage by project and time,
- anomaly flags such as route breadth bursts or a new SPID,
- attribution rate by surface.

The product rule stays strict: **observation never denies**. Freeroam emits
safe events only and deliberately does not fingerprint non-cooperating agents or
build evasion detection; that traffic remains unattributed. Every action
carrying a valid Hallmark passport resolves to one responsible human. To curb
suspicious use, the operator defines a signed Barricade surface at the first
*responsible* action — checkout, write, license, destructive operation.
Barricade walls the first responsible action, never first contact. Hallmark does
not claim bot detection; it makes exact authority checkable.

### 4.6 Trackline

- Filter by event, code, project, agent and time.
- Redact `azp`, `ln` and `cnf` by default.
- Export a signed receipt bundle for compliance review.
- Link every event to the grant `jti` and root attestation.

### 4.7 Usage and billing

- Meter observed requests, enforced decisions, minted grants and receipt volume.
- Plan tiers map to included usage plus overage.
- Invoices are generated from `UsageRecord`.
- The preview mocks all numbers; no payment processor is connected.

### 4.8 Agent-readable docs

Each hosted surface should expose the same facts to humans and agents:

- `/llms.txt` — short index and canonical links.
- `/llms-full.txt` — full product facts and API boundaries.
- `/agent/` — plain HTML view for answer engines.
- JSON-LD on public pages.
- A copyable setup prompt for coding agents.

## 5. Service boundaries

When the hosted product is built, Phase 3 adds:

- `services/registry` — attestation anchoring and key registry.
- `services/mint` — assisted grant issuance, never an autonomous authority.
- `services/usage` — metering and invoice records.
- `services/console-api` — authenticated organization/project/key APIs.
- Managed revocation freshness with signed manifests.

The UI preview must not imply these services exist. `docs/openapi.json` stays
deferred until the managed service is real.

## 6. Security boundaries

- No password storage in this preview.
- No real secrets, keys or tokens in browser state.
- Mock API keys are illustrative only.
- Production must use hashed API keys, short sessions, CSRF protection, audit
  logging, rate limits and org-scoped authorization.
- The console must never expose private signing keys.
- Stale revocation: strict `grant` surfaces reject; lower-risk profiles may
  degrade only with an alert.
- Hallmark v1 is draft, not ratified, with no production deployment.
- No ratified or certified claims until spec §21 is closed; Hallmark is the
  protocol, not a standard.

## 7. Build order after the UI preview

1. Real auth + database + org scoping.
2. Project and API-key management with hashed keys.
3. Registry and revocation freshness service.
4. Grant minting connected to a real leash/WebAuthn ceremony.
5. Trackline persistence and export.
6. Usage metering and billing.
7. Spec §21 resolution and conformance directory.

The UI preview is a product specification you can click through, not a
production system.
