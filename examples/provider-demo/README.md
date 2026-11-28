# Provider demo — control room + Freeroam → Barricade

A runnable, dependency-free Node server showing the Hallmark provider wedge,
with a local control-room dashboard at `/dashboard`.

**Draft product harness.** It is not a Hallmark L2 conformance gateway, not an
enrollment ceremony, not a hosted service, and not the finished Leash/Trackline
product. `POST /api/mint` simulates a leash issuing a fresh, short-lived grant
for one responsible action; `GET /api/mint` is an intentional local-only
shortcut for the curl walkthrough. Neither uses a real key or hosted service.
Costs are shown in mock cost units (100 units = $1); no billing is connected.
Crypto proof numbers refer to the spec-wide vector suite, not only this harness.

## Run

From the repository root:

```bash
npm install
npm run start --workspace @pascaal/provider-demo
```

Or from this directory:

```bash
node server.mjs
```

Open the printed dashboard URL. `GET /` redirects there; `GET /api/help` keeps
the plain-text API instructions.

## What the dashboard shows

| Area | What you can see and do |
| --- | --- |
| Overview | Tenant, audience, agent key, root imprint, grant/accepted/denied counters, revocation freshness |
| Grants | Every minted grant, session id, sequence number, state, request/cost remaining (cost in mock units) |
| Revocation clock | Freeze the manifest, advance a simulated clock, resume; stale revocation denies checkout with `HLM_6004` |
| Audit stream | Newest PII-redacted events, with pinned `HLM_` codes; resets and clock changes are neutral events |
| Surface policy | The signed checkout surface, gate, tier, capability, route and limits |
| Controls | Mint a grant, run checkout, copy the passport, revoke a session, kill the lineage, reset or replay the demo |

The passport lives only in browser memory. Reloading the page clears it; the
server still holds the safe event history until you reset or restart.

Suggested first run:

1. Click **Mint grant**.
2. Click **Run checkout** — expect `200 OK · checkout`.
3. Mint another grant, click **Revoke** on its row, then run checkout — expect
   `403 HLM_6002 session_revoked`.
4. Click **Kill lineage** to revoke the root imprint and every grant beneath it.
5. Click **Reset demo** to restore in-memory state, or **Replay demo** to reset,
   mint a fresh grant and run checkout again.
6. To see stale revocation fail closed: mint a grant, click **Freeze revocation**,
   click **Advance clock +60s**, then run checkout — expect
   `503 HLM_6004 revocation_set_stale`. **Resume clock** restores freshness; the
   simulated clock affects revocation freshness only, never passport expiry.

## API walkthrough

Use the port printed by the server:

```bash
BASE=http://127.0.0.1:<printed-port>

# 1. Simulate the leash issuing a grant for one checkout action.
#    GET /api/mint is the equivalent intentional preview shortcut.
PASSPORT=$(curl -s -X POST "$BASE/api/mint" -H 'Content-Type: application/json' -d '{}' | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).passport")

# 2. Read-only route: Freeroam observes, never denies.
curl -s "$BASE/api/status"

# 3. Responsible action: Barricade requires the exact grant.
curl -s -i -X POST "$BASE/api/checkout" \
  -H "Authorization: Hallmark $PASSPORT" \
  -H "Content-Type: application/json" \
  -d '{"item":"starter-plan"}'

# 4. Show safe, PII-redacted audit events.
curl -s "$BASE/api/audit"

# 5. Read the dashboard snapshot, revoke a session, or reset.
curl -s "$BASE/api/dashboard"
curl -s -X POST "$BASE/api/dashboard/revoke" \
  -H "Content-Type: application/json" \
  -d '{"kind":"session","id":"ses_demo_1"}'
curl -s -X POST "$BASE/api/dashboard/reset"
```

Omit the passport on checkout and you get `401` / `HLM_1005 malformed`. Reuse the
same passport and you get `401` / `HLM_2004 replay_detected`. Freeze revocation
and advance the clock, then checkout gives `503` / `HLM_6004
revocation_set_stale`; strict enforcement never silently fails open.

## Routes

| Route | Middleware | Behaviour |
| --- | --- | --- |
| `GET /` | none | Redirects to `/dashboard` |
| `GET /dashboard` | none | Local control-room UI |
| `GET /dashboard/styles.css`, `GET /dashboard/app.js` | none | Static assets |
| `GET /api/help` | none | Plain-text API instructions |
| `GET /api/dashboard` | none | Live snapshot of grants, revocation, counters and audit |
| `POST /api/dashboard/revoke` | none | Revoke a grant session or `kill-lineage` |
| `POST /api/dashboard/clock` | none | `{ "action": "freeze" \| "advance" \| "resume" }` simulated clock control |
| `POST /api/dashboard/reset` | none | Clear all in-memory state |
| `POST /api/mint`, `GET /api/mint` | none | Simulated leash: signs a root attestation + per-action passport (GET is an intentional local shortcut) |
| `GET /api/status` | Freeroam | Attribution recorded; request never denied |
| `POST /api/checkout` | Barricade | Grant required; observed cost charged on response finish |
| `GET /api/audit` | none | PII-redacted events from both gateways |

## What is local to this demo

- Ephemeral Ed25519 keys, generated on every start.
- A locally signed `hallmark+barricade-policy`.
- A locally refreshed revocation manifest. No manifest signature check.
- An in-memory replay cache, budget ledger, grant list and audit stream.
- No accounts, no persistence, no hosted registry, no billing.

None of this is a managed service contract. `docs/openapi.json` is deliberately
deferred until Phase 3. See [`../../docs/quickstart.md`](../../docs/quickstart.md).
