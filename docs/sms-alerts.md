# EB Admin SMS Alerts (ESP32 electricity-theft detection)

Automatic SMS notification to the registered Electricity Board (EB) admin when
a meter **chip authentication fails**.

> **Default mode is SIMULATION.** Nothing is sent and no paid service is ever
> called unless you explicitly switch to `REAL_SMS` *and* supply credentials.
> A simulated message is always labelled **“Simulated — Not sent.”**

---

## 1. How the pieces communicate

```
        ┌──────────────────────────┐        ┌────────────────────────────┐
        │  ESP32 meter firmware    │  HTTP  │  Backend (server/src/       │
        │  (firmware/esp32_...)    │ ─────► │  smsServer.mjs)            │
        │  POST /api/alerts/sms    │        │  • device auth             │
        │  x-device-id / -token    │        │  • rate limit + dedup      │
        └──────────────────────────┘        │  • SIMULATION or REAL_SMS  │
                                            └───────────────┬────────────┘
                                                            │ only if REAL_SMS
                                                            ▼
                                                   ┌──────────────────┐
                                                   │  SMS provider    │
                                                   │  (free credits)  │
                                                   └──────────────────┘

        ┌──────────────────────────┐   GET /api/alerts (optional)
        │  React dashboard         │ ◄────────────────────────────
        │  “EB ADMIN — SMS ALERTS” │   local simulation by default
        └──────────────────────────┘
```

* **ESP32 → backend.** On a failed chip auth the ESP32 sends an authenticated
  `POST /api/alerts/sms`. The backend owns the decision (simulate vs real) and
  all secrets. The ESP32 never contacts an SMS provider.
* **Backend → provider.** Only when `ALERT_MODE=REAL_SMS` and credentials are
  present. A successful HTTP response is recorded as **“Provider accepted —
  Delivery not confirmed”** — never “Delivered” (no delivery webhook exists).
* **Dashboard.** The React app runs the same alert logic locally, so the
  feature is fully usable with **no backend and no credentials**. When a
  backend URL is configured it can pull real records (and provider responses)
  via `GET /api/alerts` using the **SYNC FROM BACKEND** button.

---

## 2. Files created / modified

### Front-end (React / Vite)
| File | Status | Purpose |
| ---- | ------ | ------- |
| `src/logic/smsAlerts.js` | new | Alert model: message builder, event ids, dedup/cooldown, status labels, history persistence |
| `src/logic/alertConfig.js` | new | Reads `VITE_ALERT_MODE` / `VITE_ADMIN_PHONE_NUMBER` / `VITE_BACKEND_URL` (default SIMULATION) |
| `src/logic/backendSync.js` | new | Optional `GET /api/alerts` fetch helper (never throws) |
| `src/components/SmsAlertsPanel.jsx` | new | Dashboard column: mode, masked number, latest SMS, history, test + sync |
| `src/components/AdminServer.jsx` | modified | Renders the SMS alerts panel as a third column |
| `src/App.jsx` | modified | Alert state + handlers; alerts only on a **failed** handshake |
| `src/App.css` | modified | Layout third column + alert panel styles |

### Backend (Node)
| File | Status | Purpose |
| ---- | ------ | ------- |
| `server/src/smsServer.mjs` | new | **Runnable** dependency-free HTTP backend (`node:http`) |
| `server/src/services/SmsAlertService.mjs` | new | Core: dedup, cooldown, rate limit, dispatch, history |
| `server/src/services/SmsProvider.mjs` | new | Provider wrapper; **no call** unless REAL_SMS + creds |
| `server/src/services/DeviceAuth.mjs` | new | Constant-time device header auth |
| `server/src/services/RateLimiter.mjs` | new | Sliding-window limiter |
| `server/src/utils/smsConfig.mjs` | new | Env config + `isRealSmsEnabled` + phone masking |
| `server/src/app.mjs` | modified | Adds the same `/api/alerts*` routes to the existing Express scaffold |

### Firmware / config / docs
| File | Status | Purpose |
| ---- | ------ | ------- |
| `firmware/esp32_sms_alert/esp32_sms_alert.ino` | new | **Reference, NOT hardware-verified** ESP32 sketch |
| `firmware/esp32_sms_alert/README.md` | new | Firmware wiring + safety notes |
| `.env.example` | modified | SMS placeholders (no real secrets) |
| `docs/sms-alerts.md` | new | This document |

### Tests
`src/test/smsAlerts.test.js`, `src/test/smsAlertPanel.test.jsx`,
`src/test/backendSync.test.js`, `tests/smsConfig.test.js`,
`tests/deviceAuth.test.js`, `tests/rateLimiter.test.js`,
`tests/smsProvider.test.js`, `tests/smsAlertService.test.js`,
`tests/smsScenarios.test.js`, `tests/smsServer.test.js`.

---

## 3. Install & run (all free)

```powershell
# 1. Install dependencies (already present in this repo)
npm install

# 2. Run the dashboard (simulation works out of the box)
npm run dev            # opens http://localhost:5173

# 3. (Optional) Run the backend that the ESP32 talks to
node server/src/smsServer.mjs
#   → SMS alert backend listening on http://localhost:3001
#     (mode=SIMULATION, realSms=false, admin=not configured)

# 4. Run the full test suite
npm test               # vitest run
```

The backend uses **only Node built-ins** (`node:http`). The existing
`server/src/app.mjs` requires `express`, which is not installed, so it cannot
run under plain `node` — that is why `smsServer.mjs` exists.

---

## 4. Test the simulated SMS alert (no hardware, no credentials)

**In the dashboard:**
1. Open <http://localhost:5173>.
2. Click **⚡ VERIFY (FAKE CODE)** in the *Unauthorised thief chip* panel.
3. The *EB ADMIN — SMS ALERTS* column shows the generated SMS, labelled
   **SIMULATED SMS — Not actually sent.** and the history count increments.
4. Click **📨 SEND TEST ALERT** for a clearly-labelled `[TEST ALERT]` message.

**Against the backend:**
```powershell
# health (shows mode; never leaks the number)
curl http://localhost:3001/health

# authenticated failure report
curl -X POST http://localhost:3001/api/alerts/sms `
  -H "Content-Type: application/json" `
  -H "x-device-id: esp32-1" -H "x-device-token: tok-secret" `
  -d '{\"meterId\":\"MTR-001\",\"status\":\"FAILED\",\"reason\":\"checksum mismatch\",\"eventId\":\"INC-DEMO-1\"}'

# replay the same eventId → { "status": "duplicate" }
# no auth → 401
```

---

## 5. Enable real SMS (only with eligible free credits)

1. Copy `.env.example` → `.env`.
2. Set values (placeholders shown; never commit real secrets):
   ```
   ALERT_MODE=REAL_SMS
   ADMIN_PHONE_NUMBER=+91XXXXXXXXXX
   DEVICE_ID=<long-random>
   DEVICE_TOKEN=<long-random>
   SMS_PROVIDER=<provider-name>
   SMS_PROVIDER_URL=https://provider.example/send
   SMS_PROVIDER_API_KEY=<key>
   ```
3. Confirm the provider offers **free trial credits** for delivery to your
   recipient. This project **never** purchases credit or enables billing.
4. Restart the backend and check `GET /health` → `"realSmsEnabled": true`.
5. A provider HTTP 2xx is recorded as *Provider accepted — Delivery not
   confirmed*. Failures are recorded as *Failed* — never as success.

---

## 6. Tests: what passed, what needs external resources

**Passing (194 tests across 24 files, all offline):**

| Scenario | Test |
| -------- | ---- |
| Authorised chip → no alert | `tests/smsScenarios.test.js` |
| Unauthorised chip → simulated SMS | `tests/smsScenarios.test.js`, `src/test/smsAlertPanel.test.jsx` |
| Duplicate event → suppressed | `tests/smsAlertService.test.js`, `tests/smsServer.test.js` |
| Backend unavailable → clear error, no false success | `tests/smsScenarios.test.js`, `tests/smsProvider.test.js` |
| Credentials missing → simulation continues | `tests/smsScenarios.test.js` |
| Real SMS disabled → no external request | `tests/smsProvider.test.js` |
| Real SMS + credits → attempt + record response | `tests/smsScenarios.test.js` (via a **mocked** provider) |

**Not covered automatically (needs real resources):**
* An actual paid/trial SMS delivery — requires provider credentials; the suite
  only exercises a mocked provider.
* The ESP32 sketch — **not compiled/flashed** here; needs an ESP32 + toolchain.
* Live browser rendering of the new column is covered by jsdom component tests,
  not a real browser.

---

## 7. Limitations & manual setup

* **Nothing is sent for real by default.** Simulation is the only default path.
* Delivery is never assumed: best status is *Provider accepted — Delivery not
  confirmed* (no delivery webhook is implemented).
* The backend keeps alert history **in memory**; restarting clears it. The
  dashboard persists its own history in `localStorage`.
* Device auth is a shared `DEVICE_ID`/`DEVICE_TOKEN`, compared in constant
  time. Rotate the token if leaked. No TLS/mTLS is implemented — use it on a
  trusted network or front it with TLS.
* The repository contains **no ESP32 auth firmware**; the chip-auth logic lives
  in the JS simulation (`src/logic/verification.js`). The `.ino` sketch is a
  labelled reference and its button trigger stands in for the real auth result.
* No relays or mains are controlled by any part of this feature.
* `express` is still not a dependency; the Express routes added to
  `server/src/app.mjs` only take effect if you install Express yourself.
