// ---------------------------------------------------------------------------
// src/components/sidebar/mapEngine.js
//
// All imperative Leaflet wiring for the Tamil Nadu transformer map, isolated
// from React so it can be unit-tested against a fake `L` (jsdom cannot run a
// real Leaflet layout).
//
// `createMapEngine(L, createClusterGroup, opts)` is the testable core.
// `initTamilNaduMap(container, opts)` is the thin default wrapper that binds
// the real leaflet + leaflet.markercluster imports.
// ---------------------------------------------------------------------------

import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import {
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  TN_BOUNDS,
  TN_CENTER,
  TN_INITIAL_ZOOM,
  clusterBorderColour,
  colourForTransformer,
  iconSizeForZoom,
  labelVisibleForZoom,
  splitForClustering,
} from '../../logic/transformerMap';

/** Standard OpenStreetMap tiles (free, no API key, supports zoom 19). */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** 3D-looking distribution transformer marker (inline SVG, CSS-var coloured). */
const TRANSFORMER_SVG = `
<svg viewBox="0 0 20 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path fill="var(--tfx-dark)" d="M3 6 L10 2.6 17 6 10 9.4 Z"/>
  <rect x="3" y="6" width="14" height="12" rx="1.5" fill="var(--tfx)"/>
  <path fill="var(--tfx-edge)" d="M15.2 6 h1.8 v12 h-1.8 Z"/>
  <rect x="7.2" y="14" width="1.8" height="3.6" rx="0.6" fill="var(--tfx-dark)"/>
  <rect x="11" y="14" width="1.8" height="3.6" rx="0.6" fill="var(--tfx-dark)"/>
  <path fill="var(--tfx-edge)" d="M11.4 9.4 8.4 12.4 h2 l-1 3 3-3 h-2 Z"/>
  <path fill="rgba(255,255,255,0.30)" d="M3.6 6.6 h12.8 v3.2 h-12.8 Z"/>
</svg>`;

const MAP_OPTIONS = {
  minZoom: MAP_MIN_ZOOM,
  maxZoom: MAP_MAX_ZOOM,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 60,
  scrollWheelZoom: true,
  doubleClickZoom: true,
  touchZoom: true,
  dragging: true,
  zoomControl: true,
  maxBounds: TN_BOUNDS,
  maxBoundsViscosity: 0.8,
};

function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/**
 * Build the Leaflet engine. Returns a handle with all methods the React
 * component needs. Uses the injected `L` and cluster-group factory so tests
 * can pass lightweight fakes.
 */
export function createMapEngine(L, createClusterGroup, opts = {}) {
  const { container, onStateChange, popupRenderer } = opts;

  const map = L.map(container, MAP_OPTIONS).setView(TN_CENTER, TN_INITIAL_ZOOM);
  L.tileLayer(TILE_URL, {
    maxZoom: MAP_MAX_ZOOM,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const clusterConfig = {
    disableClusteringAtZoom: 12,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: (childCluster) => {
      const members = (childCluster.getAllChildMarkers?.() ?? [])
        .map((m) => m.__tfx)
        .filter(Boolean);
      const border = clusterBorderColour(members);
      return L.divIcon({
        className: 'tfx-cluster',
        html: `<div class="tfx-cluster-bubble tfx-cluster--${border}">${childCluster.getChildCount()}</div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
    },
  };

  // NOTE: we build a FRESH cluster group while it is DETACHED, populate it,
// then add it to the map. markercluster's public addLayer only draws a marker
// if its internal _currentShownBounds already contains it, which is unreliable
// when adding to a group that is already on the map above
// disableClusteringAtZoom. Adding the populated group triggers onAdd ->
// _recursivelyAddChildrenToMap at the current zoom, the proven init path.
  let cluster = createClusterGroup(clusterConfig);
  map.addLayer(cluster);

  const redLayer = L.layerGroup().addTo(map);

  const markers = new Map(); // id -> { t, marker }
  let currentTransformers = [];
  let lastZoom = map.getZoom();

  /** Icon-size band containing a zoom (see iconSizeForZoom contract). */
  const zoomBand = (zoom) => {
    if (zoom <= 8) return 1;
    if (zoom <= 11) return 2;
    if (zoom <= 14) return 3;
    return 4;
  };
  let currentBand = zoomBand(lastZoom);

  const makeIcon = (t) => {
    const colour = colourForTransformer(t);
    const size = iconSizeForZoom(lastZoom);
    const showLabel = labelVisibleForZoom(lastZoom);
    const label = showLabel
      ? `<span class="tfx-label">${String(t.id).replace(/[<>&"']/g, '')}</span>`
      : '';
    const totalHeight = size.height + (showLabel ? 14 : 0);
    return L.divIcon({
      className: 'tfx-icon',
      html: `<span class="tfx-marker tfx-marker--${colour}" style="width:${size.width}px;height:${size.height}px">${TRANSFORMER_SVG}${label}</span>`,
      iconSize: [size.width, totalHeight],
      iconAnchor: [size.width / 2, size.height],
      popupAnchor: [0, -size.height],
    });
  };

  const buildMarker = (t) => {
    const marker = L.marker([t.location.lat, t.location.lng], {
      icon: makeIcon(t),
      title: String(t.id),
      alt: String(t.id),
    });
    marker.__tfx = t;
    if (popupRenderer) marker.bindPopup(popupRenderer(t));
    return marker;
  };

  const render = (transformers) => {
    currentTransformers = transformers;
    // Rebuild markers into a fresh group that is populated while DETACHED, then
    // attached to the map. Its onAdd draws everything at the current zoom, so
    // unclustering above disableClusteringAtZoom always shows every marker.
    const nextCluster = createClusterGroup(clusterConfig);
    redLayer.clearLayers();
    markers.clear();
    const { clustered, alwaysIndividual } = splitForClustering(transformers);
    for (const t of clustered) {
      const marker = buildMarker(t);
      nextCluster.addLayer(marker); // detached -> queued, drawn on attach
      markers.set(t.id, { t, marker });
    }
    if (cluster) map.removeLayer(cluster);
    cluster = nextCluster;
    map.addLayer(cluster); // onAdd -> recursively draws at current zoom
    for (const t of alwaysIndividual) {
      const marker = buildMarker(t);
      marker.addTo(redLayer);
      markers.set(t.id, { t, marker });
    }
    return { clustered: clustered.length, alwaysIndividual: alwaysIndividual.length };
  };

  /**
   * On zoomend we rebuild the whole marker set ONLY when the icon-size band
   * changes. Rebuilding (instead of marker.setIcon) avoids
   * leaflet.markercluster's known icon-detach race while it unclusters at
   * `disableClusteringAtZoom`. Switching bands is rare, so this stays fast
   * even with ~1000 markers.
   */
  const onZoomEnd = debounce(() => {
    const zoom = map.getZoom();
    lastZoom = zoom;
    const band = zoomBand(zoom);
    if (band !== currentBand) {
      currentBand = band;
      render(currentTransformers);
    }
    if (onStateChange) {
      onStateChange({
        zoom,
        iconSize: iconSizeForZoom(zoom),
        labelsVisible: labelVisibleForZoom(zoom),
      });
    }
  }, 100);

  map.on('zoomend', onZoomEnd);

  const flyTo = (lat, lng, zoom) => {
    map.flyTo([lat, lng], zoom, { duration: 1 });
  };

  const resetView = () => flyTo(TN_CENTER[0], TN_CENTER[1], TN_INITIAL_ZOOM);

  /**
   * Resolve flow (POST /api/transformers/{id}/resolve confirmed): update the
   * row, then re-render so the icon pops green, the popup drops "Mark as
   * Resolved" and the marker cluster-joins at low zoom — no in-place setIcon.
   */
  const flipToResolved = (id) => {
    const idx = currentTransformers.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const updated = {
      ...currentTransformers[idx],
      map_status: 'verified',
      status: 'authorised',
      resolved_at: new Date().toISOString(),
      resolved_by: 'admin',
    };
    currentTransformers[idx] = updated;
    render(currentTransformers);
    if (onStateChange) onStateChange({ resolved: id });
    return true;
  };

  const getMarkerCount = () => markers.size;
  const getZoom = () => map.getZoom();

  const destroy = () => {
    onZoomEnd.cancel();
    map.remove();
  };

  return {
    map,
    get cluster() {
      return cluster;
    },
    redLayer,
    render,
    flyTo,
    resetView,
    flipToResolved,
    getMarkerCount,
    getZoom,
    destroy,
  };
}

/**
 * Default wrapper wired to the real Leaflet + markercluster imports.
 */
export default function initTamilNaduMap(container, opts = {}) {
  return createMapEngine(
    L,
    (cfg) => L.markerClusterGroup(cfg),
    { container, ...opts }
  );
}