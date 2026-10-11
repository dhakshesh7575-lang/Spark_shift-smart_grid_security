// ---------------------------------------------------------------------------
// server/src/services/DeviceAuth.mjs
//
// Minimal device authentication for the SMS alert endpoint.
//
// A registered device (ESP32) must send two headers:
//     x-device-id:    <DEVICE_ID>
//     x-device-token: <DEVICE_TOKEN>
// matching the values configured in the backend environment. Comparison is
// constant-time (via SHA-256 digests + timingSafeEqual) so the endpoint cannot
// be trivially probed, and unauthorised clients cannot trigger SMS messages.
// ---------------------------------------------------------------------------

import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time string comparison that is safe for unequal lengths. */
function safeEqual(a, b) {
  const ah = createHash('sha256').update(String(a)).digest();
  const bh = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ah, bh);
}

/** Case-insensitive header lookup. */
function readHeader(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  if (headers[lower] !== undefined) return headers[lower];
  const key = Object.keys(headers).find((k) => k.toLowerCase() === lower);
  return key ? headers[key] : undefined;
}

/**
 * Verify a device request. Returns { ok, reason }.
 * `headers` is a plain object (Node req.headers shape).
 */
export function checkDeviceAuth(headers = {}, config = {}) {
  if (!config.deviceId || !config.deviceToken) {
    return { ok: false, reason: 'device authentication is not configured' };
  }

  const id = readHeader(headers, 'x-device-id');
  const token = readHeader(headers, 'x-device-token');

  if (!id || !token) {
    return { ok: false, reason: 'missing device credentials' };
  }

  if (!safeEqual(id, config.deviceId) || !safeEqual(token, config.deviceToken)) {
    return { ok: false, reason: 'invalid device credentials' };
  }

  return { ok: true, reason: null };
}
