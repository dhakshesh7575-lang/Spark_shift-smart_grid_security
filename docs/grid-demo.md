# Smart Grid Security — Demo Mode, Offline Queue & SMS Fallback

Hackathon-ready demonstration of abnormal-meter-reading detection with a
truthful alerting pipeline. It builds on the existing EB-Admin SMS alert
feature (`docs/sms-alerts.md`) and **reuses** the existing backend server,
provider wrapper and rate limiter — no duplicate server or routes.

> Nothing in this feature ever claims a real SMS was delivered unless a trusted
> delivery receipt confirms it. The default mode sends **nothing**.

---

## 1. What it does

A **GRID SECURITY DEMO** panel (middle column of the bottom half) drives the
whole demonstration with simulated data:

| Control | Effect |
| --- | --- |
| ✅ NORMAL READING | Generates a normal reading (≈1.1–1.9 kW). **No alert.** |
| ⚠ SUSPECT THEFT | Generates an abnormal reading (≈7.5–12.0 kW) and creates an alert record + SMS body. |
| 📴 WI-FI / BACKEND DOWN | Marks connectivity offline; new alerts are **queued**. |
| 🔌 RESTORE CONNECTIVITY | Restores connectivity and **flushes** the offline queue. |
| 📶 SMS FALLBACK | Attempts delivery of queued alerts via the SMS fallback channel. |
| ACKNOWLEDGE | Marks an alert processed (removes it from the active queue). |
| CLEAR ALL | Clears the demo alert history. |

Each alert record shows: **meter ID, meter name, registered location,
timestamp, simulated reading, alert reason, alert status, alert ID and the
exact SMS body**.

### SMS message format

```
ALERT: Suspected electricity theft.
Meter ID: MTR-001
Meter name: Block A Meter
Location: Block A, Meter Box 1
Time: 01/01/2026, 10:00:00
Reading: 8.75 (SIMULATED)
Please verify immediately.
```

### Truthful statuses

| Status | Meaning |
| --- | --- |
| `DEMO — NOT SENT` | Demo mode / no provider configured. Nothing was sent. |
| `SMS REQUEST ACCEPTED — DELIVERY UNCONFIRMED` | The provider returned HTTP 2xx; delivery is **not** confirmed. |
| `FAILED — NOT SENT` | The provider rejected the request or the backend was unreachable. |
| `QUEUED — OFFLINE` | Wi-Fi/backend down; the alert is preserved until processed. |
| `PENDING — SENDING` | Real-SMS request in flight (transient). |

There is deliberately **no "Delivered"** status — that would require a provider
webhook, which this prototype does not implement.

---

## 2. Architecture

```
  Browser dashboard (React)                 Backend (node:http, no deps)         Provider
  ─────────────────────────                 ─────────────────────────────        ────────
  GRID SECURITY DEMO panel
    │  SUSPECT THEFT
    ▼
  createGridAlert() ── offline? ──► QUEUED — OFFLINE (localStorage queue)
    │                                  │ RESTORE / SMS FALLBACK
    ▼  online                         ▼
  deliverGridAlert()
    │  DEMO (default)  ─────────────► "DEMO — NOT SENT"  (no network at all)
    │
    │  REAL_SMS + VITE_BACKEND_URL
    ▼
  POST /api/grid-alerts ────────────► GridAlertService.ingest()
                                        │ validate → dedup → dispatch
                                        ▼
                                      SmsProvider.sendSms() ──► generic / Twilio
                                        │ 2xx → SMS_REQUEST_ACCEPTED
                                        │ err → FAILED_NOT_SENT
                                        ▼
                                      alertStore (server/data/grid-alerts.json)
```

* The **browser never holds provider credentials** and **never chooses the
  recipient**; the backend always uses `ADMIN_PHONE_NUMBER` from the env.
* The **ESP32** can call the same route if it sends `x-device-id` /
  `x-device-token` and `GRID_REQUIRE_DEVICE_AUTH=true`.

---

## 3. Files changed / added

### Frontend
* `src/logic/gridDemo.js` — demo meters, reading generators, SMS builder,
  alert model, statuses, duplicate protection, offline-queue helpers, persistence.
* `src/logic/gridAlertsApi.js` — optional backend client (injectable `fetch`).
* `src/components/GridDemoPanel.jsx` — the demo control + alert dashboard.
* `src/App.jsx` — grid-demo state, controls, delivery, queue flush, wiring.
* `src/App.css` — `.grid-demo-panel` and alert-record styles.
* `src/test/gridDemoPanel.test.jsx` — dashboard integration tests.

### Backend (all dependency-free — Node built-ins only)
* `server/src/services/GridAlertService.mjs` — validation, dedup, dispatch,
  offline queue + flush, acknowledgement, history, HTTP framing.
* `server/src/utils/alertStore.mjs` — simplest working persistence (JSON file).
* `server/src/services/SmsProvider.mjs` — **extended** with a Twilio adapter
  (form POST + Basic auth) alongside the existing generic JSON provider.
* `server/src/utils/smsConfig.mjs` — **extended** with Twilio fields and the
  Twilio branch of `isRealSmsEnabled` / `realSmsDisabledReason`.
* `server/src/smsServer.mjs` — **added** grid-alert routes (no duplicates).
* `.env.example` — provider selection + Twilio placeholders.
* `.gitignore` — ignores the runtime `server/data/` store.

### Tests
* `tests/gridDemo.test.js`, `tests/gridAlertsApi.test.js`,
  `tests/gridAlertService.test.js`, `src/test/gridDemoPanel.test.jsx`.

### Deliberately unchanged
Existing chip-auth flow, LAC/Cell-ID + LT-breaker work, and the transformer-map
feature are untouched.

---

## 4. Exact commands

**Frontend (free demo — no backend needed):**

```powershell
npm install
npm run dev
```

Open: **http://localhost:5173/**

**Optional backend (for real SMS + server-side history):**

```powershell
node server/src/smsServer.mjs
```

The port comes from `SMS_PORT` / `PORT` (default `3001`). It uses only Node
built-ins — no `npm install` required for the backend.

**Tests / build:**

```powershell
npm test
npm run build
```

---

## 5. How to demo

### Trigger a theft alert
1. Open http://localhost:5173/.
2. In **GRID SECURITY DEMO**, pick a meter (default `MTR-001`).
3. Click **⚠ SUSPECT THEFT**.
4. An alert record appears with the full SMS body and status
   **DEMO — NOT SENT** (the default mode sends nothing).

### Offline queue + fallback
1. Click **📴 WI-FI / BACKEND DOWN** → chip shows `WI-FI / BACKEND: DOWN`.
2. Click **⚠ SUSPECT THEFT** → the alert is **QUEUED — OFFLINE** (`QUEUE: 1`).
3. Click **📶 SMS FALLBACK** while still offline → it reports the alert remains
   queued (nothing sent).
4. Click **🔌 RESTORE CONNECTIVITY** → the queue is flushed; in demo mode each
   alert becomes **DEMO — NOT SENT**.
5. **ACKNOWLEDGE** marks it processed. **CLEAR ALL** empties the list.

Normal readings (**✅ NORMAL READING**) never raise an alert.

---

## 6. Enabling real SMS (only with free credits)

Real SMS is attempted **only** when all of the following hold:

* `.env`: `ALERT_MODE=REAL_SMS`
* `ADMIN_PHONE_NUMBER=+<authorised number>` (the only recipient ever used)
* a provider is configured — either:
  * **generic:** `SMS_PROVIDER=generic`, `SMS_PROVIDER_URL`, `SMS_PROVIDER_API_KEY`, or
  * **Twilio (free trial):** `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`,
    `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
* frontend: `VITE_ALERT_MODE=REAL_SMS` and `VITE_BACKEND_URL=http://localhost:3001`

Then start the backend (`node server/src/smsServer.mjs`) and the frontend. Use
only a provider free trial / free credits — **do not purchase anything**.
If any credential is missing the system silently stays in truthful demo mode.

With `SMS_PROVIDER=twilio` the adapter POSTs to
`https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json` using HTTP
Basic auth — no SDK, no extra dependency. A 2xx maps to
`SMS REQUEST ACCEPTED — DELIVERY UNCONFIRMED`.

---

## 7. Security

* The recipient is fixed by `ADMIN_PHONE_NUMBER`; the request body cannot
  redirect an SMS to an arbitrary number.
* Requests are validated (`meterId`, finite reading, length caps) and
  **rate-limited** per client; duplicate `alertId`s are rejected.
* Provider keys / auth tokens live only in backend environment variables —
  never in frontend code, firmware or source.
* `/health` and `GET /api/grid-alerts` expose a **masked** admin number and a
  capability summary only; no secrets, no recipient numbers.
* Real-SMS paths can additionally require device auth via
  `GRID_REQUIRE_DEVICE_AUTH=true`.
* The prototype never controls real mains/relays.

---

## 8. Persistence

There is **no database** in this project (verified: no sqlite/prisma/knex/
mongoose, no `DATABASE_URL`). The simplest working persistence is used:

* **Frontend:** `localStorage` key `etd.gridAlerts.v1` (browser-local).
* **Backend:** `server/data/grid-alerts.json` (single JSON file).

**Limitations (documented):** the JSON store is single-process with no query
language, indexes or transactions; concurrent writers can clobber it; the
frontend and backend histories are independent until synced. Swapping in a real
DB only requires replacing `alertStore.load()/save()`.

---

## 9. What was tested vs. unverified

### Tested automatically (`npm test`) — 28 files / 239 tests
* Exact SMS body format; readings; statuses (only ever `DEMO — NOT SENT`,
  `SMS REQUEST ACCEPTED — DELIVERY UNCONFIRMED`, `FAILED — NOT SENT`,
  `QUEUED — OFFLINE`).
* Duplicate suppression (alert id + per-meter cooldown) and that genuinely
  separate incidents still fire.
* Demo mode makes **no network call**; REAL_SMS without credentials makes **no
  network call**; REAL_SMS + credentials → provider called → accepted; provider
  failure → `FAILED — NOT SENT`.
* Offline reading queues, then `flush()` delivers; acknowledgement; validation.
* Twilio adapter shape (URL, Basic auth, form body).
* Dashboard: normal reading → no alert; theft → truthful record; offline queue
  → flush; fallback; acknowledge; clear.

### Verified manually
* `node server/src/smsServer.mjs` then curl: `/health`,
  `POST /api/grid-alerts` (accept → `DEMO — NOT SENT`), duplicate → `duplicate`,
  offline → `QUEUED — OFFLINE`, invalid → `400`, `flush` → `{flushed:1}`,
  acknowledge, `GET /api/grid-alerts`.
* `npx vite build` compiles (68 modules).

### Unverified / needs resources
* **Real provider delivery** — no provider account / free credits available, so
  **no real SMS was sent** in testing. Only the adapter shape is covered.
* **Physical ESP32 / GSM** — no hardware module exists; the firmware
  (`firmware/esp32_sms_alert/`) is a labelled reference, not verified on
  hardware. The dashboard path needs no Wokwi/hardware.
