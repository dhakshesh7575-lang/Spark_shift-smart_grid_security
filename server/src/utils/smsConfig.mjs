// ---------------------------------------------------------------------------
// server/src/utils/smsConfig.mjs
//
// Reads the EB-Admin SMS alert configuration from environment variables.
// SIMULATION is the default and requires no credentials and no network.
// REAL_SMS is only ever considered "enabled" when the operator explicitly sets
// ALERT_MODE=REAL_SMS *and* supplies an admin number + provider URL + key.
//
// No secrets live in source; everything comes from the environment.
// ---------------------------------------------------------------------------

/** Trim a possibly-undefined env value to a string. */
function str(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

/** Parse a positive integer env value with a fallback. */
function int(value, fallback) {
  const n = Number.parseInt(str(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Normalise an arbitrary env value to a known alert mode. */
export function normaliseAlertMode(raw) {
  return str(raw).toUpperCase() === 'REAL_SMS' ? 'REAL_SMS' : 'SIMULATION';
}

/**
 * Resolve the full SMS config. `env` is injectable for tests; defaults to
 * process.env.
 */
export function getSmsConfig(env = process.env) {
  const e = env || {};
  return {
    mode: normaliseAlertMode(e.ALERT_MODE),
    adminPhone: str(e.ADMIN_PHONE_NUMBER),
    backendUrl: str(e.BACKEND_URL),
    deviceId: str(e.DEVICE_ID),
    deviceToken: str(e.DEVICE_TOKEN),
    provider: str(e.SMS_PROVIDER) || 'none',
    providerUrl: str(e.SMS_PROVIDER_URL),
    providerApiKey: str(e.SMS_PROVIDER_API_KEY),
    senderId: str(e.SMS_SENDER_ID),
    // Twilio-style provider (uses plain HTTPS + Basic auth; no SDK needed).
    twilioAccountSid: str(e.TWILIO_ACCOUNT_SID),
    twilioAuthToken: str(e.TWILIO_AUTH_TOKEN),
    twilioFromNumber: str(e.TWILIO_FROM_NUMBER) || str(e.SMS_SENDER_ID),
    // Optional hardening for the dashboard/relay grid-alert route.
    gridRequireDeviceAuth: str(e.GRID_REQUIRE_DEVICE_AUTH).toLowerCase() === 'true',
    cooldownSeconds: int(e.ALERT_COOLDOWN_SECONDS, 60),
    rateLimitPerMinute: int(e.ALERT_RATE_LIMIT_PER_MINUTE, 10),
    port: int(e.SMS_PORT || e.PORT, 3001),
  };
}

/**
 * True only when a real SMS may be attempted. Requires explicit REAL_SMS mode
 * AND complete credentials for the selected provider. Anything missing keeps
 * the system in simulation.
 */
export function isRealSmsEnabled(config) {
  if (!config || config.mode !== 'REAL_SMS') return false;
  if (config.provider === 'twilio') {
    return !!(config.adminPhone && config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
  }
  return !!(config.adminPhone && config.providerUrl && config.providerApiKey);
}

/** Explain why real SMS is disabled (useful for honest logging/diagnostics). */
export function realSmsDisabledReason(config) {
  if (!config || config.mode !== 'REAL_SMS') return 'ALERT_MODE is not REAL_SMS (simulation mode).';
  if (!config.adminPhone) return 'ADMIN_PHONE_NUMBER is not set.';
  if (config.provider === 'twilio') {
    if (!config.twilioAccountSid) return 'TWILIO_ACCOUNT_SID is not set.';
    if (!config.twilioAuthToken) return 'TWILIO_AUTH_TOKEN is not set.';
    if (!config.twilioFromNumber) return 'TWILIO_FROM_NUMBER is not set.';
    return null;
  }
  if (!config.providerUrl) return 'SMS_PROVIDER_URL is not set.';
  if (!config.providerApiKey) return 'SMS_PROVIDER_API_KEY is not set.';
  return null;
}

/** Mask a phone number for display/logging (never expose the full number). */
export function maskPhone(number) {
  const s = str(number);
  if (!s) return 'not configured';
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}
