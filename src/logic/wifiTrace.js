// ---------------------------------------------------------------------------
// src/logic/wifiTrace.js
//
// Generates realistic-looking Wi-Fi / network / geolocation details for a
// thief that has just failed verification.
//
// In the real system these values would be harvested by the distribution
// transformer's microcontroller (or an inline gateway) from the rogue node's
// association attempt: SSID it is broadcasting, its BSSID/MAC, its IP, and a
// coarse geolocation derived from gateway/Cell-ID/IP databases.
// ---------------------------------------------------------------------------

import { CITIES, SSID_PREFIXES, SSID_SUFFIXES, TRANSFORMERS } from './constants';

/** Random integer in [min, max] inclusive. */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Uniformly pick one element from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random upper-case hex string of `len` characters. */
function randHex(len) {
  let out = '';
  const chars = '0123456789ABCDEF';
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

/** Build a believable router SSID, e.g. "TP-LINK_4G", "JioFiber-2.4G". */
export function generateSSID() {
  return `${pick(SSID_PREFIXES)}${pick(SSID_SUFFIXES)}`;
}

/** Build a MAC-address-style BSSID, e.g. "A4:5E:60:1B:9C:22". */
export function generateBSSID() {
  const octets = Array.from({ length: 6 }, () => randHex(2));
  return octets.join(':');
}

/** Private local IP on the classic 192.168.x.x range. */
export function generateLocalIP() {
  return `192.168.${randInt(0, 9)}.${randInt(2, 254)}`;
}

/** Synthesise a routable public IPv4 address (simulation only). */
export function generatePublicIP() {
  // Avoid the common private/reserved first octets so it looks public.
  const first = pick([1, 14, 27, 41, 49, 61, 103, 117, 121, 185, 202, 219]);
  return `${first}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

/**
 * Pick a city and add a small random jitter so consecutive thefts from the
 * same city are distinguishable by their coordinates.
 */
export function generateGeo() {
  const base = pick(CITIES);
  const lat = +(base.lat + (Math.random() - 0.5) * 0.08).toFixed(5);
  const lng = +(base.lng + (Math.random() - 0.5) * 0.08).toFixed(5);
  return { city: base.city, country: base.country, lat, lng };
}

/**
 * Assemble a complete theft trace.
 *
 * @param {string|null} transformerId Transformer prefix detected during the
 *        failed verification. When the code was too malformed to identify a
 *        transformer, a random one is chosen so the report still attributes
 *        the theft to a real distribution point.
 * @returns {{
 *   ssid: string, bssid: string, localIp: string, publicIp: string,
 *   lac: number|null, cell_id: string|number|null,
 *   lat: number, lng: number, city: string, country: string,
 *   transformerId: string, transformerLabel: string, timestamp: string
 * }}
 */
export function generateWifiTrace(transformerId) {
  const geo = generateGeo();
  const transformer =
    TRANSFORMERS.find((t) => t.prefix === transformerId) || pick(TRANSFORMERS);

  return {
    ssid: generateSSID(),
    bssid: generateBSSID(),
    localIp: generateLocalIP(),
    publicIp: generatePublicIP(),
    // GSM fallback identity. This client-side simulator always reports Wi-Fi,
    // so the fields are null here; they render as "Unavailable" and exist so
    // the network display can show them when a device is offline.
    lac: null,
    cell_id: null,
    lat: geo.lat,
    lng: geo.lng,
    city: geo.city,
    country: geo.country,
    transformerId: transformer.prefix,
    transformerLabel: transformer.label,
    // ISO timestamp + a friendly local rendering are both useful.
    timestamp: new Date().toISOString(),
    timestampLocal: new Date().toLocaleString(),
  };
}
