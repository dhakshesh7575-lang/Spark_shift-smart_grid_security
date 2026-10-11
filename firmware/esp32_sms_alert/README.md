# ESP32 → EB Admin SMS Alert (reference firmware)

> **STATUS: REFERENCE / NOT HARDWARE-VERIFIED.**
> This sketch was written against the project's documented contract but has not
> been compiled or flashed in this environment (no ESP32 toolchain available).
> Treat it as a clearly-labelled reference, not a proven binary.

## What it does

When a meter chip authentication **fails**, the ESP32 sends an authenticated
HTTP POST to the backend. The backend decides whether the alert is a
**simulation** (default) or a **real SMS** (only if explicitly configured with
eligible free credits). The ESP32 never contacts an SMS provider and never
holds provider credentials.

```
POST {BACKEND_URL}/api/alerts/sms
x-device-id:    <DEVICE_ID>
x-device-token: <DEVICE_TOKEN>
Content-Type:   application/json

{ "meterId": "MTR-001", "status": "FAILED", "reason": "checksum mismatch", "eventId": "INC-..." }
```

Only `status: "FAILED"` produces an alert. A `VERIFIED` result produces none.

## Safety

* The firmware only uses Wi-Fi + HTTP. It does **not** switch a relay or any
  electrical mains.
* It makes no purchases and triggers no paid service by itself.
* Credentials live in the sketch only as placeholders — provision real values
  out-of-band and never commit them.

## Board / libraries

* Any ESP32 dev board with Wi-Fi.
* Arduino core for ESP32 (`WiFi.h`, `HTTPClient.h`).

## Configure

Either edit the constants at the top of `esp32_sms_alert.ino`, or (preferred)
inject them at build time:

| Constant        | Matches backend env |
| --------------- | ------------------- |
| `WIFI_SSID`     | —                   |
| `WIFI_PASSWORD` | —                   |
| `BACKEND_URL`   | `BACKEND_URL` (use the LAN IP of the SMS server host) |
| `DEVICE_ID`     | `DEVICE_ID`         |
| `DEVICE_TOKEN`  | `DEVICE_TOKEN`      |

## How to test without real theft / hardware

1. Start the backend: `node server/src/smsServer.mjs` (see repo README).
2. Confirm `http://<host>:3001/health` reports `"alertMode":"SIMULATION"`.
3. Flash the sketch, open the serial monitor (115200 baud).
4. Press GPIO0 (the BOOT button) to simulate a **failed** authentication.
5. The serial log shows the HTTP response and the alert appears in the
   backend's `GET /api/alerts`, labelled **Simulated — Not sent**.

## Notes / limitations

* The button trigger is a **test mechanism** standing in for the real
  chip-auth routine; the real firmware would call `reportFailedAuth()` from its
  verification result.
* No TLS certificate pinning is implemented; use it over a trusted LAN or add
  TLS before production use.
* Delivery is never assumed: the backend reports `Provider accepted — Delivery
  not confirmed` at best.
