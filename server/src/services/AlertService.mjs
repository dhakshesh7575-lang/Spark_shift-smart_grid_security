import { createSecurityEvent } from '../models/SecurityEvent.mjs';
import { NotificationQueue } from './NotificationQueue.js';
import { getAdminsFromEnv } from '../utils/adminConfig.mjs';

const queue = new NotificationQueue();

function generateIncidentId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'INC-' + crypto.randomUUID();
  }
  return 'INC-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10).toUpperCase();
}

// GSM fallback identifier bounds (inclusive). LAC is 16-bit; Cell Identity is
// up to 28-bit (UMTS). Values outside these ranges are discarded (warn-only).
const LAC_MAX = 65535;
const CELL_ID_MAX = 268435455;

/**
 * Is a network field meaningfully populated?
 * The literal string "Unavailable" is the project's sentinel for "absent",
 * so it does NOT count as present (this keeps Wi-Fi/GSM fallback consistent).
 */
function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.toLowerCase() !== 'unavailable';
  }
  return true;
}

/** True when value is a non-negative integer within [0, max]. */
function isInRange(value, max) {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(n) && n >= 0 && n <= max;
}

/**
 * Sanitise one optional GSM field: trim, reject empty strings, convert to
 * null, and drop out-of-range values (warn-only — the request is never
 * rejected). Returns a string/number, or null.
 */
function sanitiseGsmField(payload, key, max) {
  const value = payload[key];
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  if (!isInRange(raw, max)) {
    console.warn(`[alert] Ignoring ${key} out of range (0-${max}): ${JSON.stringify(value)}`);
    return null;
  }
  return raw;
}

/**
 * Resolve the device's network identity.
 *
 * Exactly one of {wifi_ssid} or {lac + cell_id} may be populated. If Wi-Fi is
 * present we keep it and clear the GSM fields (defensive; warn-only, never
 * rejects). If neither is present everything is null and no error is raised.
 * Payloads that omit lac/cell_id entirely simply default to null.
 */
export function resolveNetworkIdentity(payload = {}) {
  const wifiPresent = isPresent(payload.wifi_ssid);
  let lac = sanitiseGsmField(payload, 'lac', LAC_MAX);
  let cell_id = sanitiseGsmField(payload, 'cell_id', CELL_ID_MAX);

  if (wifiPresent && (lac !== null || cell_id !== null)) {
    console.warn(
      '[alert] Both Wi-Fi SSID and GSM LAC/Cell ID supplied; preferring Wi-Fi SSID and clearing LAC/Cell ID.'
    );
    lac = null;
    cell_id = null;
  }

  return { lac, cell_id };
}

export function handleSecurityAlert(payload = {}) {
  try {
    const { lac, cell_id } = resolveNetworkIdentity(payload);
    const event = createSecurityEvent({
      eventType: payload.eventType || 'ACCESS_REJECTION',
      transformerId: payload.transformerId || payload.transformer || null,
      rejectReason: payload.rejectReason || null,
      lac,
      cell_id,
      eventData: payload.eventData || { ...payload }
    });
    
    const admins = getAdminsFromEnv();
    const jobs = [];
    admins.forEach(num => {
      const job = queue.enqueue({
        incidentId: event.id,
        recipientNumber: num,
        event,
        template: payload.template || 'DEFAULT_ALERT'
      });
      if (job) jobs.push(job);
    });
    
    return {
      status: 'accepted',
      incident_id: event.id,
      queued: jobs.length,
      network: { lac: event.lac, cell_id: event.cell_id }
    };
  } catch (err) {
    return { status: 'error', message: 'internal error' };
  }
}

export { queue, generateIncidentId };
