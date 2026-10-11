// ---------------------------------------------------------------------------
// src/logic/alertConfig.js
//
// Front-end alert configuration, sourced from Vite env vars with safe
// defaults. Simulation is ALWAYS the default: REAL_SMS is only selected when
// VITE_ALERT_MODE is explicitly set to REAL_SMS.
//
// The browser dashboard never holds SMS provider credentials. In REAL_SMS
// mode it may relay to the backend (VITE_BACKEND_URL), which owns the secrets.
// ---------------------------------------------------------------------------

import { ALERT_MODES } from './smsAlerts';

/** Normalise an env value to a known alert mode. */
export function normaliseMode(raw) {
  return String(raw || 'SIMULATION').toUpperCase() === 'REAL_SMS'
    ? ALERT_MODES.REAL_SMS
    : ALERT_MODES.SIMULATION;
}

/** Strip trailing slashes from a base URL. */
function trimUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

/**
 * Resolve the dashboard alert config. `env` is injectable for tests; by
 * default it reads import.meta.env.
 */
export function getAlertConfig(env) {
  let source = env;
  if (!source) {
    try {
      source = import.meta.env;
    } catch {
      source = {};
    }
  }
  const e = source || {};
  return {
    mode: normaliseMode(e.VITE_ALERT_MODE),
    adminNumber: e.VITE_ADMIN_PHONE_NUMBER || '',
    backendUrl: trimUrl(e.VITE_BACKEND_URL),
  };
}
