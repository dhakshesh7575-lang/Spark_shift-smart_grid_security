// ---------------------------------------------------------------------------
// server/src/services/SmsAlertService.mjs
//
// Core EB-Admin SMS alert orchestration for the backend.
//
// Responsibilities:
//   * Only a FAILED chip authentication produces an alert (VERIFIED → none).
//   * Build the alert SMS body (mirrors the front-end template exactly).
//   * Deduplicate by event id + per-meter cooldown so genuinely separate
//     incidents are still reported.
//   * Enforce device authentication and rate limiting for HTTP callers.
//   * Dispatch through SmsProvider (simulation by default; real only when
//     explicitly configured with credentials).
//   * Keep an in-memory history the dashboard/API can read.
//
// Every dependency (config, fetch, clock) is injectable for testing.
// ---------------------------------------------------------------------------

import { getSmsConfig, isRealSmsEnabled } from '../utils/smsConfig.mjs';
import { checkDeviceAuth } from './DeviceAuth.mjs';
import { RateLimiter } from './RateLimiter.mjs';
import { sendSms } from './SmsProvider.mjs';

/** Honest, dashboard-ready labels for each delivery status code. */
export const SMS_STATUS_LABELS = {
  SIMULATED: 'Simulated — Not sent',
  PENDING: 'Pending',
  PROVIDER_ACCEPTED: 'Provider accepted — Delivery not confirmed',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
};

/** Return a trimmed string if meaningfully present, else the fallback. */
function present(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  if (s.length === 0 || s.toLowerCase() === 'unavailable') return fallback;
  return s;
}

/** Deterministic incident id from the details (same incident → same id). */
export function makeEventId(meterId, code, at, test = false) {
  const seed = `${meterId}|${code || ''}|${at}|${test ? 'TEST' : ''}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash >>>= 0;
  }
  return 'ALERT-' + hash.toString(16).toUpperCase().padStart(8, '0');
}

/** Build the SMS body from real project values (never prints "undefined"). */
export function buildAlertMessage({ meterId, eventTime, reason, test = false } = {}) {
  const id = present(meterId, 'UNKNOWN');
  const when = present(eventTime, 'Unavailable');

  const lines = [
    'ELECTRICITY THEFT ALERT!',
    '',
    'Unauthorised meter access detected.',
    '',
    `Meter ID: ${id}`,
    'Event: Chip Authentication Failed',
    `Date/Time: ${when}`,
  ];
  const why = present(reason);
  if (why) lines.push(`Reason: ${why}`);
  lines.push('', 'Please verify the meter immediately.');
  if (test) lines.unshift('[TEST ALERT — SIMULATION ONLY]');
  return lines.join('\n');
}

/**
 * Create a stateful SMS alert service instance.
 */
export function createSmsAlertService({
  config = getSmsConfig(),
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  maxHistory = 100,
} = {}) {
  const history = [];
  const seenEventIds = new Set();
  const lastByMeter = new Map();
  const limiter = new RateLimiter({ perMinute: config.rateLimitPerMinute });
  let seq = 0;

  /** Return a duplicate reason string if this alert was already handled. */
  function duplicateReason(eventId, meterKey, at) {
    if (eventId && seenEventIds.has(eventId)) return 'duplicate event id';
    const last = lastByMeter.get(meterKey);
    if (last !== undefined && at - last >= 0 && at - last < config.cooldownSeconds * 1000) {
      return `cooldown active for meter ${meterKey}`;
    }
    return null;
  }

  /**
   * Ingest one authentication outcome. A VERIFIED outcome yields no alert.
   * @returns {Promise<{alerted, outcome, reason?, record?}>}
   */
  async function ingest({ meterId, reason, status, eventTime, eventId, code, test = false } = {}) {
    if (String(status || '').toUpperCase() === 'VERIFIED') {
      return {
        alerted: false,
        outcome: 'NO_ALERT',
        reason: 'authentication succeeded — no alert generated',
      };
    }

    const at = now();
    const meterKey = present(meterId, 'UNKNOWN');
    const eid = present(eventId) || makeEventId(meterKey, code, at, test);

    const dup = duplicateReason(eid, meterKey, at);
    if (dup) return { alerted: false, outcome: 'DUPLICATE', reason: dup };

    const record = {
      id: `SMS-${String(++seq).padStart(4, '0')}`,
      eventId: eid,
      meterId: meterKey,
      eventTime: present(eventTime) || new Date(at).toISOString(),
      reason: present(reason) || 'Chip Authentication Failed',
      authStatus: 'FAILED',
      mode: config.mode,
      test: !!test,
      createdAt: new Date(at).toISOString(),
      at,
    };
    record.message = buildAlertMessage({ ...record, test });

    const send = await sendSms({ to: config.adminPhone, message: record.message }, config, fetchImpl);
    record.smsStatus = send.status;
    record.smsStatusLabel = SMS_STATUS_LABELS[send.status] || SMS_STATUS_LABELS.FAILED;
    record.providerResponse = send.providerResponse !== undefined ? send.providerResponse : null;
    record.sent = !!send.sent;
    record.detail = send.detail;

    seenEventIds.add(eid);
    lastByMeter.set(meterKey, at);
    history.unshift(record);
    if (history.length > maxHistory) history.pop();

    return { alerted: true, outcome: record.smsStatus, record };
  }

  /** Ingest an authentication outcome (record-level, no HTTP framing). */
  async function handleResult(payload = {}) {
    return ingest(payload);
  }

  /**
   * Handle a device HTTP request: authenticate → rate limit → validate →
   * ingest. Returns { httpStatus, body } so any HTTP server can use it.
   */
  async function handleDeviceRequest({ headers = {}, body = {} } = {}) {
    const auth = checkDeviceAuth(headers, config);
    if (!auth.ok) {
      return { httpStatus: 401, body: { status: 'error', message: auth.reason } };
    }

    const deviceKey = present(headers['x-device-id'] || headers['X-Device-Id'], 'device');
    const rl = limiter.check(deviceKey);
    if (!rl.allowed) {
      return {
        httpStatus: 429,
        body: {
          status: 'error',
          message: 'rate limit exceeded — too many alerts',
          retryAfterMs: rl.retryAfterMs,
        },
      };
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { httpStatus: 400, body: { status: 'error', message: 'request body must be a JSON object' } };
    }

    const { meterId, code } = body;
    if (!present(meterId) && !present(code)) {
      return { httpStatus: 400, body: { status: 'error', message: 'meterId or code is required' } };
    }

    const result = await ingest(body);
    if (!result.alerted && result.outcome === 'NO_ALERT') {
      return { httpStatus: 200, body: { status: 'no_alert', ...result } };
    }
    if (!result.alerted && result.outcome === 'DUPLICATE') {
      return { httpStatus: 200, body: { status: 'duplicate', ...result } };
    }
    return { httpStatus: 200, body: { status: 'accepted', ...result } };
  }

  /** Create a clearly-labelled TEST alert (no real incident needed). */
  async function sendTestAlert() {
    return ingest({
      meterId: 'MTR-TEST-001',
      reason: 'Manual test of the SMS alert system',
      status: 'FAILED',
      eventTime: new Date(now()).toISOString(),
      eventId: `TEST-${now()}`,
      test: true,
    });
  }

  /** Snapshot of the alert history (copies, so callers cannot mutate state). */
  function getHistory() {
    return history.map((r) => ({ ...r }));
  }

  /** Current mode + capability summary for the dashboard/health endpoint. */
  function getState() {
    return {
      mode: config.mode,
      realSmsEnabled: isRealSmsEnabled(config),
      cooldownSeconds: config.cooldownSeconds,
      rateLimitPerMinute: config.rateLimitPerMinute,
    };
  }

  return { ingest, handleResult, handleDeviceRequest, sendTestAlert, getHistory, getState, limiter };
}
