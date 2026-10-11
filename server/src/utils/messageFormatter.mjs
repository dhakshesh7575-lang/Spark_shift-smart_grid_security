// Message formatter
//
// Builds the plain-text WhatsApp alert body for a security event.
// Network identity rule: exactly one of {wifi_ssid} or {lac + cell_id} is
// populated. If Wi-Fi is present we keep it and render LAC/Cell ID as the
// project's absent-field sentinel. Absent values never render as "undefined".

/** Project-wide representation of an absent field. */
const UNAVAILABLE = 'Unavailable';

/** True when a value is meaningfully present (not null/blank/"Unavailable"). */
function isPresent(value) {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return s.length > 0 && s.toLowerCase() !== 'unavailable';
}

/** Render a field value, falling back to "Unavailable" (never "undefined"). */
function display(value) {
  return isPresent(value) ? String(value).trim() : UNAVAILABLE;
}

export function format_alert(payload = {}) {
  const lines = [];
  if (payload.simulated) lines.push('[SIMULATED DATA]');

  // Defensive: Wi-Fi and GSM must never both be shown. Prefer Wi-Fi and hide
  // the GSM fields, logging a warning (never throw).
  const wifiPresent = isPresent(payload.wifi_ssid);
  let lac = payload.lac;
  let cell_id = payload.cell_id;
  if (wifiPresent && (isPresent(lac) || isPresent(cell_id))) {
    console.warn(
      '[format_alert] Both Wi-Fi SSID and GSM LAC/Cell ID present; preferring Wi-Fi SSID and hiding LAC/Cell ID.'
    );
    lac = null;
    cell_id = null;
  }

  lines.push(`Wi-Fi SSID: ${display(payload.wifi_ssid)}`);
  lines.push(`LAC: ${display(lac)}`);
  lines.push(`Cell ID: ${display(cell_id)}`);
  lines.push(`BSSID / MAC: ${display(payload.bssid_mac)}`);
  lines.push(`Local IP: ${display(payload.local_ip)}`);
  lines.push(`Public IP: ${display(payload.public_ip)}`);
  lines.push(`Approx. geolocation: ${display(payload.geolocation)}`);
  if (payload.city) lines.push(`Approx. IP city: Approximate: ${display(payload.city)}`);
  else lines.push(`Approx. IP city: ${UNAVAILABLE}`);
  lines.push(`Transformer: ${display(payload.transformer)}`);
  lines.push(`Timestamp: ${display(payload.timestamp)}`);
  lines.push(`Reject reason: ${display(payload.reject_reason)}`);
  return lines.join('\n');
}
