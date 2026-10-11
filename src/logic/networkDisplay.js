// ---------------------------------------------------------------------------
// src/logic/networkDisplay.js
//
// Pure helpers for rendering a captured trace's network identity.
//
// Rule: exactly ONE of {Wi-Fi SSID} or {LAC + Cell ID} is shown at a time.
// Absent values render as the project-wide sentinel "Unavailable" and are
// never rendered as "undefined".
// ---------------------------------------------------------------------------

/** Project-wide representation of an absent field. */
export const UNAVAILABLE = 'Unavailable';

/** True when a value is meaningfully present (not null/blank/"Unavailable"). */
export function isPresent(value) {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return s.length > 0 && s.toLowerCase() !== 'unavailable';
}

/**
 * Resolve display strings for the network block from a trace object
 * ({ ssid, lac, cell_id }).
 *
 * - Wi-Fi present  -> SSID shown; LAC / Cell ID hidden as "Unavailable".
 * - Wi-Fi absent   -> SSID "Unavailable"; LAC / Cell ID rendered below it.
 * - All absent     -> every field "Unavailable" (no crash).
 * - Defensive both -> Wi-Fi wins, GSM hidden, a warning is logged.
 */
export function resolveNetworkDisplay(trace = {}) {
  const wifiPresent = isPresent(trace.ssid);
  let lac = trace.lac;
  let cellId = trace.cell_id;

  if (wifiPresent && (isPresent(lac) || isPresent(cellId))) {
    console.warn(
      '[network] Both Wi-Fi SSID and GSM LAC/Cell ID present; preferring Wi-Fi SSID and hiding LAC/Cell ID.'
    );
    lac = null;
    cellId = null;
  }

  return {
    ssid: wifiPresent ? String(trace.ssid).trim() : UNAVAILABLE,
    lac: isPresent(lac) ? String(lac).trim() : UNAVAILABLE,
    cellId: isPresent(cellId) ? String(cellId).trim() : UNAVAILABLE,
  };
}
