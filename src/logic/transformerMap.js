// ---------------------------------------------------------------------------
// src/logic/transformerMap.js
//
// Pure, DOM-free helpers for the Tamil Nadu transformer map. Keeping these
// here means they are unit-testable in jsdom without Leaflet.
//
// Colour contract (driven by backend `map_status`):
//   verified    -> green
//   compromised -> red
//   unknown     -> grey
//   anything else -> grey + one-time console.warn
// When the dataset has no `map_status` field (the current client-side seed
// uses `authorised` / `unauthorised`), deriveMapStatus() falls back to it.
// ---------------------------------------------------------------------------

/** State-wide initial view for the map (Tamil Nadu centroid + overview zoom). */
export const TN_CENTER = [11.1271, 78.6569];
export const TN_INITIAL_ZOOM = 7;

/** Leaflet zoom limits: 6 (state) .. 19 (street). */
export const MAP_MIN_ZOOM = 6;
export const MAP_MAX_ZOOM = 19;

/**
 * Rectangular view bounds covering Tamil Nadu + ~1 degree margin on each side.
 * Used as Leaflet `maxBounds` so users do not drift off-state accidentally.
 * [southWest, northEast]
 */
export const TN_BOUNDS = [
  [8.0, 76.0], // approx. Kanyakumari / west margin
  [14.5, 81.0], // approx. north Chennai / east margin
];

/** Map statuses understood by the colour contract. */
export const MAP_STATUS = {
  VERIFIED: 'verified',
  COMPROMISED: 'compromised',
  UNKNOWN: 'unknown',
};

/** Filter chip options shown above the map. */
export const MAP_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: MAP_STATUS.VERIFIED, label: 'Verified' },
  { value: MAP_STATUS.COMPROMISED, label: 'Compromised' },
  { value: MAP_STATUS.UNKNOWN, label: 'Unknown' },
];

export const STATUS_COLOURS = {
  [MAP_STATUS.VERIFIED]: 'green',
  [MAP_STATUS.COMPROMISED]: 'red',
  [MAP_STATUS.UNKNOWN]: 'grey',
};

/** Quick-jump cities — exact order requested, coordinates from TN_LOCATIONS. */
export const CITY_JUMP = [
  'Chennai',
  'Coimbatore',
  'Madurai',
  'Trichy',
  'Salem',
  'Tirunelveli',
  'Erode',
  'Vellore',
  'Thoothukudi',
  'Thanjavur',
  'Tiruppur',
  'Dindigul',
  'Nagercoil',
  'Hosur',
  'Kanchipuram',
];

/** Sentinel for the "All Tamil Nadu" reset. */
export const ALL_CITIES = '__ALL__';
export const ALL_CITIES_LABEL = 'All Tamil Nadu';

/** Sentinel for "no city filter". */
export const NO_CITY_FILTER = null;

/**
 * 3D transformer icon size per zoom band.
 *   zoom <= 8            -> 20x26 (state)
 *   zoom 9-11            -> 24x30 (district)
 *   zoom 12-14           -> 30x38 (city)
 *   zoom >= 15           -> 36x46 (street)
 */
export function iconSizeForZoom(zoom) {
  const z = Number(zoom);
  if (z <= 8) return { width: 20, height: 26 };
  if (z <= 11) return { width: 24, height: 30 };
  if (z <= 14) return { width: 30, height: 38 };
  return { width: 36, height: 46 };
}

/** Transformer-ID labels under icons are shown only at zoom >= 13. */
export function labelVisibleForZoom(zoom) {
  return Number(zoom) >= 13;
}

/** Is this zoom at state overview (zoom hint shown)? */
export function isStateOverviewZoom(zoom) {
  return Number(zoom) <= 9;
}

/**
 * Resolve the colour class for a transformer from the backend `map_status`
 * field. Unknown/absent values degrade to 'grey' and trigger a warning.
 */
export function getColourForStatus(mapStatus) {
  const s = String(mapStatus ?? '').trim().toLowerCase();
  if (s === '') return 'grey';
  const colour = STATUS_COLOURS[s];
  if (colour) return colour;
  console.warn(`[transformerMap] unknown map_status "${mapStatus}" treated as grey`);
  return 'grey';
}

/**
 * Backend-first status lookup. If the transformer carries a `map_status`
 * field (as the real backend endpoint will) use it verbatim. Otherwise fall
 * back to the client-side seed's `authorised`/`unauthorised` values.
 */
export function deriveMapStatus(t) {
  if (t && typeof t.map_status === 'string' && t.map_status.trim() !== '') {
    return t.map_status.trim().toLowerCase();
  }
  if (t && t.status === 'unauthorised') return MAP_STATUS.COMPROMISED;
  if (t && t.status === 'authorised') return MAP_STATUS.VERIFIED;
  return MAP_STATUS.UNKNOWN;
}

/** Colour for a transformer, from backend-first status. */
export function colourForTransformer(t) {
  return getColourForStatus(deriveMapStatus(t));
}

/**
 * Split transformers into "cluster these" (green+grey) and "ALWAYS show
 * individually" (red). Red transformers are never allowed inside a cluster.
 */
export function splitForClustering(transformers) {
  const clustered = [];
  const alwaysIndividual = [];
  for (const t of transformers) {
    if (colourForTransformer(t) === 'red') alwaysIndividual.push(t);
    else clustered.push(t);
  }
  return { clustered, alwaysIndividual };
}

/**
 * Cluster bubble border: red if the cluster contains ANY red transformer,
 * green if every member is green, grey otherwise.
 */
export function clusterBorderColour(members) {
  let hasRed = false;
  let allGreen = true;
  for (const t of members) {
    const c = colourForTransformer(t);
    if (c === 'red') hasRed = true;
    if (c !== 'green') allGreen = false;
  }
  if (hasRed) return 'red';
  if (allGreen) return 'green';
  return 'grey';
}

/**
 * Apply map-view filters (city + status chip) to the transformer list.
 * `filters.city` is a location name, ALL_CITIES, or null for no city filter.
 */
export function filterTransformersForMap(transformers, filters = {}) {
  const city = filters.city;
  const status = filters.status ?? 'all';
  return transformers.filter((t) => {
    if (city != null && city !== ALL_CITIES && t.city !== city) return false;
    if (status !== 'all' && deriveMapStatus(t) !== status) return false;
    return true;
  });
}

/**
 * Look up the [lat, lng] for a quick-jump city from the locations list.
 * Falls back to null (caller then resets to TN_CENTER).
 */
export function findCityCoordinates(locations, cityName) {
  const loc = locations.find((l) => l.name === cityName);
  return loc ? [loc.lat, loc.lng] : null;
}

/**
 * Simulated/approximate marker text rules — kept here so the popup renderer is
 * pure and testable.
 */
export function incidentLabelFor(t) {
  if (t && (t.last_incident_id || t.lastIncidentId)) {
    return String(t.last_incident_id ?? t.lastIncidentId);
  }
  return null;
}

export function incidentTimestampFor(t) {
  if (t && (t.last_incident_at || t.lastIncidentAt)) {
    return String(t.last_incident_at ?? t.lastIncidentAt);
  }
  return null;
}

export function isResolved(t) {
  return Boolean(t && (t.resolved_at || t.resolvedAt));
}

export function resolvedBy(t) {
  return t && (t.resolved_by ?? t.resolvedBy) ? String(t.resolved_by ?? t.resolvedBy) : null;
}

/** Whether the marker's location should be labelled approximate. */
export function isApproximate(t) {
  return Boolean(
    t && (t.approximate === true || deriveMapStatus(t) === MAP_STATUS.UNKNOWN)
  );
}