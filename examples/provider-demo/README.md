# Provider demo — Freeroam → Barricade

A runnable, dependency-free Node server showing the Hallmark provider wedge.

**Draft product harness.** It is not a Hallmark L2 conformance gateway, not an
enrollment ceremony, and not a hosted service. `/api/mint` simulates a leash
issuing a fresh, short-lived grant for one responsible action.

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

Then, in another terminal:

```bash
BASE=http://127.0.0.1:3000

# 1. Simulate the leash issuing a grant for one checkout action.
PASSPORT=$(curl -s "$BASE/api/mint" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).passport")

# 2. Read-only route: Freeroam observes, never denies.
curl -s "$BASE/api/status"

# 3. Responsible action: Barricade requires the exact grant.
curl -s -i -X POST "$BASE/api/checkout" \
  -H "Authorization: Hallmark $PASSPORT" \
  -H "Content-Type: application/json" \
  -d '{"item":"starter-plan"}'

# 4. Show safe, PII-redacted audit events.
curl -s "$BASE/api/audit"
```

Omit the passport on step 3 and you get `401` / `HLM_1005 malformed`. Reuse the
same passport and you get `401` / `HLM_2004 replay_detected`.

## Routes

| Route | Middleware | Behaviour |
| --- | --- | --- |
| `GET /` | none | Run instructions |
| `GET /api/mint` | none | Simulated leash: signs a root attestation + per-action passport |
| `GET /api/status` | Freeroam | Attribution recorded; request never denied |
| `POST /api/checkout` | Barricade | Grant required; observed cost charged on response finish |
| `GET /api/audit` | none | PII-redacted events from both gateways |

## What is local to this demo

- Ephemeral Ed25519 keys, generated on every start.
- A locally signed `hallmark+barricade-policy`.
- A locally refreshed revocation manifest. No manifest signature check.
- An in-memory replay cache and budget ledger.

None of this is a managed service contract. `docs/openapi.json` is deliberately
deferred until Phase 3. See [`../../docs/quickstart.md`](../../docs/quickstart.md).
