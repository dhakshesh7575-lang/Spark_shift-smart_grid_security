// ---------------------------------------------------------------------------
// src/logic/smsAlerts.js
//
// Pure, dependency-free model for the EB-Admin SMS alert feature.
//
// This is the SIMULATION-first implementation that powers the dashboard.  It
// never talks to a paid service: by default every alert is labelled
// "Simulated — Not sent".  The optional REAL_SMS path lives in the backend
// (server/src/services/SmsAlertService.mjs), which the ESP32 calls over HTTP.
//
// Design rules (must stay in sync with the backend):
//   * Only a FAILED chip authentication produces an alert.
//   * Absent values never render as "undefined" — they fall back to the
//     project sentinel behaviour ("Unknown" meter / no reason line).
//   * Duplicate suppression via event id + a per-meter cooldown, so genuinely
//     separate incidents are still reported.
//   * Status labels are honest: a simulated message is never called "sent".
// ---------------------------------------------------------------------------

/** Alert delivery modes. SIMULATION is the default and needs no credentials. */
export const ALERT_MODES = {
  SIMULATION: 'SIMULATION',
  REAL_SMS: 'REAL_SMS',
};

/**
 * Human-readable SMS status labels. These are the ONLY strings the dashboard
 * shows for delivery state, and they never over-claim.
 */
export const SMS_STATUS = {
  SIMULATED: 'Simulated — Not sent',
  PENDING: 'Pending',
  PROVIDER_ACCEPTED: 'Provider accepted — Delivery not confirmed',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
};

/** Map a backend status code onto a dashboard label. */
export function statusLabel(code) {
  return SMS_STATUS[code] || SMS_STATUS.FAILED;
}

/** Default duplicate-suppression window per meter (seconds). */
export const DEFAULT_COOLDOWN_SECONDS = 60;

/** Maximum number of alerts retained in the dashboard history. */
export const MAX_HISTORY = 50;

/** localStorage key for the simulated alert history. */
export const STORAGE_KEY = 'etd.smsAlerts.history.v1';

/** The clear label required by the spec whenever a message is not really sent. */
export const SIMULATION_NOTICE = 'SIMULATED SMS — Not actually sent.';

/** Return a trimmed string if meaningfully present, else the fallback. */
function presentOr(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  if (s.length === 0 || s.toLowerCase() === 'unavailable') return fallback;
  return s;
}

/** True when a value is meaningfully present. */
export function isPresent(value) {
  return presentOr(value, null) !== null;
}

/**
 * Build the SMS body. Mirrors the spec's sample message exactly while using
 * the real project values passed in (meter id, timestamp, reason).
 */
export function buildAlertMessage({ meterId, eventTime, reason, test = false } = {}) {
  const id = presentOr(meterId, 'UNKNOWN');
  const when = presentOr(eventTime, 'Unavailable');

  const lines = [
    'ELECTRICITY THEFT ALERT!',
    '',
    'Unauthorised meter access detected.',
    '',
    `Meter ID: ${id}`,
    'Event: Chip Authentication Failed',
    `Date/Time: ${when}`,
  ];
  const why = presentOr(reason, null);
  if (why) lines.push(`Reason: ${why}`);
  lines.push('', 'Please verify the meter immediately.');

  // A test alert is labelled so it can never be confused with a real incident.
  if (test) lines.unshift('[TEST ALERT — SIMULATION ONLY]');
  return lines.join('\n');
}

/**
 * Deterministic, collision-resistant event id derived from the incident
 * details. Same incident reported twice yields the same id (deduplicated);
 * a new incident yields a new id.
 */
export function makeEventId(meterId, code, at, test = false) {
  const seed = `${meterId}|${code || ''}|${at}|${test ? 'TEST' : ''}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash >>>= 0;
  }
  return 'ALERT-' + hash.toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Create a dashboard alert record from a failed authentication result.
 * `now` is injectable for deterministic tests.
 */
export function createSmsAlert({
  meterId,
  reason,
  eventTime,
  code,
  mode = ALERT_MODES.SIMULATION,
  test = false,
  now = Date.now(),
} = {}) {
  const meterKey = presentOr(meterId, 'UNKNOWN');
  const when = presentOr(eventTime, new Date(now).toLocaleString());
  const resolvedMode = mode === ALERT_MODES.REAL_SMS ? ALERT_MODES.REAL_SMS : ALERT_MODES.SIMULATION;

  return {
    eventId: makeEventId(meterKey, code, now, test),
    meterId: meterKey,
    meterKey,
    eventTime: when,
    reason: presentOr(reason, 'Chip Authentication Failed'),
    authStatus: 'FAILED',
    mode: resolvedMode,
    // Simulation is immediately "Simulated — Not sent"; real mode awaits the
    // backend/provider, so it starts as "Pending" and is never assumed sent.
    smsStatus: resolvedMode === ALERT_MODES.REAL_SMS ? SMS_STATUS.PENDING : SMS_STATUS.SIMULATED,
    message: buildAlertMessage({ meterId: meterKey, eventTime: when, reason, test }),
    providerResponse: null,
    simulated: resolvedMode === ALERT_MODES.SIMULATION,
    test,
    createdAt: new Date(now).toISOString(),
    at: now,
  };
}

/**
 * Decide whether an alert is a duplicate of something already in `history`.
 * Returns a human-readable reason string, or null when it should be recorded.
 */
export function findDuplicate(history, alert, { cooldownSeconds = DEFAULT_COOLDOWN_SECONDS } = {}) {
  if (!Array.isArray(history) || !alert) return null;

  // 1. Exact same event id → the same incident reported twice.
  if (history.some((a) => a.eventId === alert.eventId)) return 'duplicate event id';

  // 2. Same meter inside the cooldown window → flood suppression. A later,
  //    genuinely separate incident (outside the window) is allowed through.
  const cooldownMs = cooldownSeconds * 1000;
  const prior = history.find((a) => {
    if (a.meterKey !== alert.meterKey) return false;
    const delta = alert.at - a.at;
    return delta >= 0 && delta < cooldownMs;
  });
  if (prior) return `cooldown active for meter ${alert.meterKey} (${cooldownSeconds}s)`;

  return null;
}

/**
 * Append an alert to the history with duplicate/cooldown suppression.
 * Test alerts bypass suppression so an operator can always verify the path.
 *
 * Returns { history, added, duplicate, reason }.
 */
export function appendAlert(history, alert, opts = {}) {
  const list = Array.isArray(history) ? history : [];

  if (!alert) return { history: list, added: false, duplicate: false, reason: 'no alert' };

  if (alert.test) {
    return {
      history: [alert, ...list].slice(0, MAX_HISTORY),
      added: true,
      duplicate: false,
      reason: 'test alert (suppression bypassed)',
    };
  }

  const dup = findDuplicate(list, alert, opts);
  if (dup) return { history: list, added: false, duplicate: true, reason: dup };

  return {
    history: [alert, ...list].slice(0, MAX_HISTORY),
    added: true,
    duplicate: false,
    reason: null,
  };
}

/**
 * Build a shareable text report for one alert (used by the dashboard's
 * "copy report" action). Uses only real project values.
 */
export function buildSmsReport(alert) {
  if (!alert) return '';
  return (
    `EB ADMIN SMS ALERT REPORT\n` +
    `Event ID: ${alert.eventId}\n` +
    `Meter ID: ${alert.meterId}\n` +
    `Event: Chip Authentication Failed\n` +
    `Date/Time: ${alert.eventTime}\n` +
    `Reason: ${alert.reason}\n` +
    `Mode: ${alert.mode}\n` +
    `SMS status: ${alert.smsStatus}\n` +
    `Provider response: ${alert.providerResponse ? JSON.stringify(alert.providerResponse) : 'none'}\n`
  );
}

/** Mask an admin phone number for display (never log full numbers). */
export function maskPhone(number) {
  const s = presentOr(number, '');
  if (!s) return 'not configured';
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}

/**
 * Normalise an alert record returned by the backend API into the dashboard
 * shape. Returns null for records without a usable event id.
 */
export function normaliseBackendAlert(record) {
  if (!record || typeof record !== 'object') return null;
  const eventId = presentOr(record.eventId, null);
  if (!eventId) return null;

  const meterId = presentOr(record.meterId, 'UNKNOWN');
  const parsedAt = typeof record.at === 'number' ? record.at : Date.parse(record.createdAt || '');

  return {
    eventId,
    meterId,
    meterKey: meterId,
    eventTime: presentOr(record.eventTime, 'Unavailable'),
    reason: presentOr(record.reason, 'Chip Authentication Failed'),
    authStatus: record.authStatus || 'FAILED',
    mode: record.mode === ALERT_MODES.REAL_SMS ? ALERT_MODES.REAL_SMS : ALERT_MODES.SIMULATION,
    // Prefer the backend's honest label; fall back to mapping the code.
    smsStatus: presentOr(record.smsStatusLabel, null) || statusLabel(record.smsStatus),
    providerResponse: record.providerResponse === undefined ? null : record.providerResponse,
    message: presentOr(record.message, ''),
    test: !!record.test,
    createdAt: record.createdAt || '',
    at: Number.isFinite(parsedAt) ? parsedAt : 0,
  };
}

/**
 * Merge backend alert records into the local history, de-duplicated by
 * eventId, newest first, capped at MAX_HISTORY.
 */
export function mergeBackendAlerts(history, records) {
  const list = Array.isArray(history) ? history.slice() : [];
  const seen = new Set(list.map((a) => a.eventId));

  let added = 0;
  (Array.isArray(records) ? records : []).forEach((raw) => {
    const alert = normaliseBackendAlert(raw);
    if (!alert || seen.has(alert.eventId)) return;
    seen.add(alert.eventId);
    list.push(alert);
    added += 1;
  });

  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  return { history: list.slice(0, MAX_HISTORY), added };
}

// ---- persistence (localStorage, tolerant of absent/corrupt storage) -------

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Load the simulated alert history from storage, always returning an array. */
export function loadAlertHistory(storage) {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist the alert history (best effort — storage may be unavailable). */
export function saveAlertHistory(history, storage) {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify((Array.isArray(history) ? history : []).slice(0, MAX_HISTORY)));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

/** Clear the stored alert history (best effort). */
export function clearAlertHistory(storage) {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
