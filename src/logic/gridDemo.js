// ---------------------------------------------------------------------------
// src/logic/gridDemo.js
//
// Smart Grid Security — DEMO domain model.
//
// This is the hackathon demo path: it needs NO backend, NO provider and NO
// credentials. It models a consumer meter, a simulated reading, the theft
// alert record, the exact SMS body, and an offline alert queue.
//
// Truthfulness rules (mirrors the backend):
//   * Nothing is ever labelled "Delivered" — there is no delivery receipt.
//   * Demo alerts are "DEMO — NOT SENT".
//   * Provider-accepted alerts are "SMS REQUEST ACCEPTED — DELIVERY UNCONFIRMED".
//   * Failures are "FAILED — NOT SENT".
//   * Alerts raised while offline are "QUEUED — OFFLINE" until processed.
// ---------------------------------------------------------------------------

/** Registered demo meters (realistic sample data). */
export const DEMO_METERS = [
  { meterId: 'MTR-001', meterName: 'Block A Meter', location: 'Block A, Meter Box 1' },
  { meterId: 'MTR-002', meterName: 'Block B Meter', location: 'Block B, Meter Box 2' },
  { meterId: 'MTR-003', meterName: 'Pump House Meter', location: 'Pump House, Meter Box 3' },
];

/** Default meter used by the spec's sample SMS. */
export const DEFAULT_METER_ID = 'MTR-001';

/** Readings above this (kW) are treated as a suspected theft. */
export const THEFT_THRESHOLD_KW = 5.0;

/** Alert reason text. */
export const THEFT_REASON = 'Suspected electricity theft';

/** Connectivity + SMS channel states. */
export const CONNECTIVITY = { ONLINE: 'ONLINE', OFFLINE: 'OFFLINE' };
export const SMS_CHANNEL = { DEMO: 'DEMO', REAL_SMS: 'REAL_SMS', GSM_FALLBACK: 'GSM_FALLBACK' };

/** Truthful, dashboard-ready alert statuses. */
export const ALERT_STATUS = {
  DEMO_NOT_SENT: 'DEMO — NOT SENT',
  SMS_REQUEST_ACCEPTED: 'SMS REQUEST ACCEPTED — DELIVERY UNCONFIRMED',
  FAILED_NOT_SENT: 'FAILED — NOT SENT',
  QUEUED_OFFLINE: 'QUEUED — OFFLINE',
  PENDING: 'PENDING — SENDING',
};

export const MAX_GRID_HISTORY = 50;
export const DEFAULT_GRID_COOLDOWN_SECONDS = 10;
export const GRID_STORAGE_KEY = 'etd.gridAlerts.v1';

/** Round to 2 decimals. */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Format a reading for display (always 2 decimals). */
export function formatReading(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '--';
}

/** Generate a normal consumer reading (kW), roughly 1.1–1.9. */
export function generateNormalReading(rng = Math.random) {
  return round2(1.1 + rng() * 0.8);
}

/** Generate an abnormal (theft-suspect) reading (kW), roughly 7.5–12.0. */
export function generateTheftReading(rng = Math.random) {
  return round2(7.5 + rng() * 4.5);
}

/** True when a reading is above the theft threshold. */
export function isTheftReading(value) {
  return Number(value) > THEFT_THRESHOLD_KW;
}

/** Look up a demo meter by id (falls back to the first meter). */
export function findMeter(meterId) {
  return DEMO_METERS.find((m) => m.meterId === meterId) || DEMO_METERS[0];
}

/** Return a trimmed value or the fallback. */
function present(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length === 0 ? fallback : s;
}

/**
 * Build the SMS message in the required format, using real values:
 *
 *   ALERT: Suspected electricity theft.
 *   Meter ID: MTR-001
 *   Meter name: Block A Meter
 *   Location: Block A, Meter Box 1
 *   Time: 01/01/2026, 10:00:00
 *   Reading: 8.75 (SIMULATED)
 *   Please verify immediately.
 */
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

// Monotonic counter so two events in the same millisecond stay unique.
let ALERT_SEQ = 0;

/** Deterministic-but-unique alert id. */
export function makeAlertId(meterId, at, seq) {
  const s = seq === undefined ? (ALERT_SEQ += 1) : seq;
  const seed = `${meterId}|${at}|${s}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash >>>= 0;
  }
  return 'GA-' + hash.toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Create an alert record from a simulated abnormal reading.
 */
export function createGridAlert({
  meter,
  reading,
  reason = THEFT_REASON,
  timestamp,
  connectivity = CONNECTIVITY.ONLINE,
  smsChannel = SMS_CHANNEL.DEMO,
  now = Date.now(),
  seq,
} = {}) {
  const m = meter || DEMO_METERS[0];
  const ts = present(timestamp, new Date(now).toLocaleString());
  const offline = connectivity === CONNECTIVITY.OFFLINE;

  const status = offline
    ? ALERT_STATUS.QUEUED_OFFLINE
    : smsChannel === SMS_CHANNEL.REAL_SMS
      ? ALERT_STATUS.PENDING
      : ALERT_STATUS.DEMO_NOT_SENT;

  const alert = {
    alertId: makeAlertId(m.meterId, now, seq),
    meterId: m.meterId,
    meterName: m.meterName,
    location: m.location,
    timestamp: ts,
    reading: Number(reading),
    reason,
    connectivity,
    smsChannel,
    status,
    queued: offline,
    acknowledged: false,
    providerResponse: null,
    createdAt: new Date(now).toISOString(),
    at: now,
  };
  alert.smsMessage = buildTheftSms(alert);
  return alert;
}

/**
 * Append an alert with duplicate protection: an exact alert id, or a repeat
 * for the same meter + reason inside the cooldown window, is suppressed.
 */
export function appendGridAlert(history, alert, { cooldownSeconds = DEFAULT_GRID_COOLDOWN_SECONDS } = {}) {
  const list = Array.isArray(history) ? history : [];
  if (!alert) return { history: list, added: false, reason: 'no alert' };

  if (list.some((a) => a.alertId === alert.alertId)) {
    return { history: list, added: false, reason: 'duplicate alert id' };
  }
  const cooldownMs = cooldownSeconds * 1000;
  const prior = list.find(
    (a) =>
      a.meterId === alert.meterId &&
      a.reason === alert.reason &&
      alert.at - a.at >= 0 &&
      alert.at - a.at < cooldownMs
  );
  if (prior) {
    return { history: list, added: false, reason: `cooldown active for ${alert.meterId}` };
  }
  return { history: [alert, ...list].slice(0, MAX_GRID_HISTORY), added: true, reason: null };
}

/** Update a single alert by id (marks the record immutable otherwise). */
export function updateGridAlert(history, alertId, patch) {
  const list = Array.isArray(history) ? history : [];
  return list.map((a) => (a.alertId === alertId ? { ...a, ...patch } : a));
}

/** Acknowledge an alert — removes it from the active queue, keeps history. */
export function acknowledgeGridAlert(history, alertId) {
  return updateGridAlert(history, alertId, { acknowledged: true, queued: false });
}

/** Alerts still waiting in the offline queue. */
export function queuedGridAlerts(history) {
  return (Array.isArray(history) ? history : []).filter((a) => a.queued && !a.acknowledged);
}

/** Count of unacknowledged alerts (used for the dashboard badge). */
export function unacknowledgedCount(history) {
  return (Array.isArray(history) ? history : []).filter((a) => !a.acknowledged).length;
}

// ---- persistence (localStorage) -------------------------------------------

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadGridAlerts(storage) {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(GRID_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGridAlerts(history, storage) {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(GRID_STORAGE_KEY, JSON.stringify((Array.isArray(history) ? history : []).slice(0, MAX_GRID_HISTORY)));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function clearGridAlerts(storage) {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(GRID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
