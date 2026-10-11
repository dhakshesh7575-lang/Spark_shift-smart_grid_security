// ---------------------------------------------------------------------------
// server/src/services/GridAlertService.mjs
//
// Backend orchestration for abnormal METER-READING alerts (the grid demo's
// "suspected electricity theft" events). It complements SmsAlertService (which
// handles chip-authentication failures) and reuses the same SmsProvider.
//
// Guarantees:
//   * Nothing is sent unless REAL_SMS is explicitly enabled with credentials;
//     otherwise the alert is recorded with status DEMO_NOT_SENT.
//   * A provider HTTP 2xx maps to SMS_REQUEST_ACCEPTED — never "Delivered".
//   * Alerts raised while offline are QUEUED_OFFLINE and sent on flush().
//   * Duplicate submissions (same alertId) are rejected.
//   * The recipient is ALWAYS config.adminPhone — never taken from the request.
//
// All dependencies (config, fetch, clock, store) are injectable for tests.
// ---------------------------------------------------------------------------

import { getSmsConfig, isRealSmsEnabled, realSmsDisabledReason, maskPhone } from '../utils/smsConfig.mjs';
import { checkDeviceAuth } from './DeviceAuth.mjs';
import { RateLimiter } from './RateLimiter.mjs';
import { sendSms, PROVIDER_STATUS } from './SmsProvider.mjs';
import { createAlertStore } from '../utils/alertStore.mjs';

/** Truthful status codes → dashboard labels. */
export const GRID_STATUS = {
  DEMO_NOT_SENT: 'DEMO — NOT SENT',
  SMS_REQUEST_ACCEPTED: 'SMS REQUEST ACCEPTED — DELIVERY UNCONFIRMED',
  FAILED_NOT_SENT: 'FAILED — NOT SENT',
  QUEUED_OFFLINE: 'QUEUED — OFFLINE',
};

/** Map a provider status to a grid alert status code. */
export function providerStatusToGridStatus(status) {
  switch (status) {
    case PROVIDER_STATUS.PROVIDER_ACCEPTED:
      return 'SMS_REQUEST_ACCEPTED';
    case PROVIDER_STATUS.FAILED:
      return 'FAILED_NOT_SENT';
    case PROVIDER_STATUS.SIMULATED:
    default:
      return 'DEMO_NOT_SENT';
  }
}

/** Return a trimmed value or the fallback. */
function present(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length === 0 ? fallback : s;
}

/** Format a reading with 2 decimals. */
export function formatReading(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '--';
}

/** Build the theft SMS body (mirrors the front-end template exactly). */
export function buildTheftSms({ meterId, meterName, location, reading, timestamp } = {}) {
  return [
    'ALERT: Suspected electricity theft.',
    `Meter ID: ${present(meterId, 'UNKNOWN')}`,
    `Meter name: ${present(meterName, 'Unknown meter')}`,
    `Location: ${present(location, 'Unknown location')}`,
    `Time: ${present(timestamp, 'Unavailable')}`,
    `Reading: ${formatReading(reading)} (SIMULATED)`,
    'Please verify immediately.',
  ].join('\n');
}

/**
 * Validate an inbound grid-alert payload.
 * @returns {{ok: boolean, errors?: string[], value?: object}}
 */
export function validateGridAlert(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['request body must be a JSON object'] };
  }

  const meterId = present(payload.meterId);
  if (!meterId) errors.push('meterId is required');
  else if (meterId.length > 64) errors.push('meterId is too long (max 64)');

  const reading = Number(payload.reading);
  if (!Number.isFinite(reading)) errors.push('reading must be a finite number');
  else if (reading < 0 || reading > 100000) errors.push('reading is out of range');

  const alertId = present(payload.alertId);
  if (alertId && alertId.length > 64) errors.push('alertId is too long (max 64)');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      alertId: alertId || null,
      meterId,
      meterName: present(payload.meterName, 'Unknown meter'),
      location: present(payload.location, 'Unknown location'),
      reading,
      reason: present(payload.reason, 'Suspected electricity theft'),
      timestamp: present(payload.timestamp, new Date().toLocaleString()),
      connectivity: present(payload.connectivity, 'ONLINE').toUpperCase(),
    },
  };
}

/** Deterministic fallback alert id when the caller did not supply one. */
export function makeGridAlertId(meterId, at, seq) {
  const seed = `${meterId}|${at}|${seq}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash >>>= 0;
  }
  return 'GA-' + hash.toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Create a stateful grid-alert service.
 */
export function createGridAlertService({
  config = getSmsConfig(),
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  store = createAlertStore(),
  maxHistory = 200,
} = {}) {
  // Most-recent-first; loaded from the JSON store when present.
  let records = (() => {
    const loaded = store.load();
    return Array.isArray(loaded) ? loaded.slice(0, maxHistory) : [];
  })();
  const seenAlertIds = new Set(records.map((r) => r.alertId).filter(Boolean));
  const limiter = new RateLimiter({ perMinute: config.rateLimitPerMinute });
  let seq = 0;

  const persist = () => {
    try {
      store.save(records);
    } catch {
      /* best-effort */
    }
  };

  /** Dispatch one record through the provider (or record demo/queued state). */
  async function dispatch(record) {
    if (record.connectivity === 'OFFLINE') {
      record.statusCode = 'QUEUED_OFFLINE';
      record.queued = true;
      record.sent = false;
      record.detail = 'Wi-Fi/backend offline — alert queued for delivery.';
      return record;
    }

    const send = await sendSms({ to: config.adminPhone, message: record.message }, config, fetchImpl);
    record.statusCode = providerStatusToGridStatus(send.status);
    record.queued = false;
    record.sent = !!send.sent;
    record.providerResponse = send.providerResponse !== undefined ? send.providerResponse : null;
    record.detail = send.detail;
    return record;
  }

  /**
   * Ingest a validated grid alert.
   * @returns {Promise<{accepted, outcome, reason?, record?}>}
   */
  async function ingest(payload = {}) {
    const check = validateGridAlert(payload);
    if (!check.ok) {
      return { accepted: false, outcome: 'INVALID', reason: check.errors.join('; ') };
    }
    const value = check.value;
    const at = now();
    const alertId = value.alertId || makeGridAlertId(value.meterId, at, ++seq);

    if (seenAlertIds.has(alertId)) {
      return { accepted: false, outcome: 'DUPLICATE', reason: `duplicate alert id ${alertId}` };
    }

    const record = {
      alertId,
      meterId: value.meterId,
      meterName: value.meterName,
      location: value.location,
      reading: value.reading,
      reason: value.reason,
      timestamp: value.timestamp,
      connectivity: value.connectivity,
      mode: config.mode,
      statusCode: 'QUEUED_OFFLINE',
      status: '',
      queued: false,
      acknowledged: false,
      sent: false,
      providerResponse: null,
      createdAt: new Date(at).toISOString(),
      at,
    };
    record.message = buildTheftSms(record);

    await dispatch(record);
    record.status = GRID_STATUS[record.statusCode] || GRID_STATUS.FAILED_NOT_SENT;

    seenAlertIds.add(alertId);
    records.unshift(record);
    if (records.length > maxHistory) records.length = maxHistory;
    persist();

    return { accepted: true, outcome: record.statusCode, record };
  }

  /** Retry every queued (offline) alert. */
  async function flush() {
    const queued = records.filter((r) => r.queued && !r.acknowledged);
    let flushed = 0;
    for (const record of queued) {
      record.connectivity = 'ONLINE';
      // eslint-disable-next-line no-await-in-loop
      await dispatch(record);
      record.status = GRID_STATUS[record.statusCode] || GRID_STATUS.FAILED_NOT_SENT;
      flushed += 1;
    }
    if (flushed) persist();
    return { flushed };
  }

  /** Mark an alert acknowledged / processed. */
  function acknowledge(alertId) {
    const record = records.find((r) => r.alertId === alertId);
    if (!record) return { ok: false, reason: 'alert not found' };
    record.acknowledged = true;
    record.queued = false;
    persist();
    return { ok: true, record };
  }

  /** Snapshot of the alert history (copies). */
  function list() {
    return records.map((r) => ({ ...r }));
  }

  /** State for /health (no secrets — the number is masked). */
  function getState() {
    return {
      mode: config.mode,
      realSmsEnabled: isRealSmsEnabled(config),
      provider: config.provider,
      providerConfigured: isRealSmsEnabled(config),
      disabledReason: realSmsDisabledReason(config),
      adminNumberMasked: maskPhone(config.adminPhone),
      rateLimitPerMinute: config.rateLimitPerMinute,
      count: records.length,
      queued: records.filter((r) => r.queued).length,
    };
  }

  /**
   * Handle an inbound HTTP request for grid alerts.
   * Device auth is enforced only when GRID_REQUIRE_DEVICE_AUTH=true, because the
   * recipient is fixed by config and the browser dashboard must be able to call
   * this route without holding device secrets.
   */
  async function handleHttpRequest({ headers = {}, body = {}, clientKey = 'anon' } = {}) {
    if (config.gridRequireDeviceAuth) {
      const auth = checkDeviceAuth(headers, config);
      if (!auth.ok) return { httpStatus: 401, body: { status: 'error', message: auth.reason } };
    }

    const rl = limiter.check(clientKey);
    if (!rl.allowed) {
      return {
        httpStatus: 429,
        body: { status: 'error', message: 'rate limit exceeded — too many alerts', retryAfterMs: rl.retryAfterMs },
      };
    }

    const result = await ingest(body);
    if (!result.accepted && result.outcome === 'INVALID') {
      return { httpStatus: 400, body: { status: 'error', message: result.reason } };
    }
    if (!result.accepted && result.outcome === 'DUPLICATE') {
      return { httpStatus: 200, body: { status: 'duplicate', reason: result.reason } };
    }
    return { httpStatus: 200, body: { status: 'accepted', alert: result.record } };
  }

  return { ingest, flush, acknowledge, list, getState, handleHttpRequest, limiter };
}
