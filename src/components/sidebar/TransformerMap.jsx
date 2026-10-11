// ---------------------------------------------------------------------------
// src/components/sidebar/TransformerMap.jsx
//
// The Tamil Nadu transformer map itself (Step 2 of the map feature). Hosts the
// Leaflet engine inside a sized container and renders the always-on overlay
// chrome: status filter chips, quick-jump cities, legend, zoom hint, toast.
//
// Leaflet runs only inside this component. The pure helpers live in
// ../../logic/transformerMap.js and the Leaflet wiring in ./mapEngine.js.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { TN_LOCATIONS } from '../../data/tnebTransformers';
import { getMapTransformers, resolveMapTransformer } from '../../data/mapStatusStore';
import {
  ALL_CITIES_LABEL,
  CITY_JUMP,
  MAP_FILTER_OPTIONS,
  TN_INITIAL_ZOOM,
  colourForTransformer,
  filterTransformersForMap,
  findCityCoordinates,
  isStateOverviewZoom,
} from '../../logic/transformerMap';
import initTamilNaduMap from './mapEngine';
import { buildMarkerPopupHtml } from './transformerPopup';

const CITY_ZOOM = 12;

export default function TransformerMap({ onClose, onViewIncidents }) {
  const mapRef = useRef(null);
  const engineRef = useRef(null);

  const [city, setCity] = useState(null); // null = no city filter (all TN)
  const [status, setStatus] = useState('all');
  const [rows, setRows] = useState(() => getMapTransformers()); // backend rows (map_status attached)
  const [zoom, setZoom] = useState(TN_INITIAL_ZOOM);
  const [toast, setToast] = useState(null);
  const [mapState, setMapState] = useState('starting'); // starting|ready|unavailable

  const filtered = useMemo(
    () => filterTransformersForMap(rows, { city, status }),
    [rows, city, status]
  );

  const redCount = useMemo(
    () => filtered.filter((t) => colourForTransformer(t) === 'red').length,
    [filtered]
  );

  // ---- build / tear down the Leaflet engine (once) -----------------------
  useEffect(() => {
    const container = mapRef.current;
    if (!container) return undefined;

    // jsdom (vitest) cannot lay out Leaflet — containers measure 0. Skip real
    // init there so the rest of the suite stays green; mark state "unavailable".
    const rect = container.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setMapState('unavailable');
      return undefined;
    }

    try {
      const engine = initTamilNaduMap(container, {
        onStateChange: (s) => {
          if (typeof s.zoom === 'number') setZoom(s.zoom);
        },
        popupRenderer: (t) => buildMarkerPopupHtml(t, { adminAuthenticated: true }),
      });
      engineRef.current = engine;
      setMapState('ready');

      // Dev-only debug handle for manual/live verification (stripped from
      // production builds by import.meta.env.DEV). Lets you read live zoom in
      // the console and lets the Step-6 headless verifier assert real zoom.
      if (import.meta.env.DEV) {
        window.__tfxMap = {
          get zoom() {
            return engineRef.current?.getZoom() ?? null;
          },
          markerCount: () => engineRef.current?.getMarkerCount() ?? 0,
          engine: () => engineRef.current,
          map: () => engineRef.current?.map ?? null,
        };
      }

      // Popup actions are outside the React tree (Leaflet DOM), so delegate
      // clicks on the map container.
      const onAction = (e) => {
        const btn = e.target.closest('[data-tfx-action]');
        if (!btn) return;
        if (btn.dataset.tfxAction === 'resolve') {
          handleResolve(btn.dataset.tfxId);
        } else if (btn.dataset.tfxAction === 'view-incidents') {
          e.preventDefault();
          onViewIncidents?.(btn.dataset.tfxId);
        }
      };
      container.addEventListener('click', onAction);

      return () => {
        container.removeEventListener('click', onAction);
        engine.destroy();
        engineRef.current = null;
        if (import.meta.env.DEV && window.__tfxMap) delete window.__tfxMap;
      };
    } catch (err) {
      console.error('[TransformerMap] engine failed to start', err);
      setMapState('unavailable');
      return undefined;
    }
    // handleResolve is stable via ref; eslint intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keep markers in sync with the filters -----------------------------
  useEffect(() => {
    engineRef.current?.render(filtered);
  }, [filtered]);

  const handleResolve = async (id) => {
    if (!id) return;
    // POST /api/transformers/{id}/resolve in production; here the mapStatusStore
    // is the backend. It returns the confirmed row (flip) or null (keep red).
    const row = resolveMapTransformer(id, 'admin');
    if (row) {
      setRows((prev) => prev.map((r) => (r.id === id ? row : r)));
      engineRef.current?.flipToResolved(id);
      setToast(`Transformer ${id} marked resolved — icon updated to green.`);
    } else {
      setToast('Resolve failed — transformer not found. Status unchanged (red).');
    }
  };

  const jumpToCity = (name) => {
    const coords = findCityCoordinates(TN_LOCATIONS, name);
    if (coords) {
      setCity(name);
      engineRef.current?.flyTo(coords[0], coords[1], CITY_ZOOM);
    } else {
      setCity(null);
      engineRef.current?.resetView();
    }
  };

  const showAll = () => {
    setCity(null);
    engineRef.current?.resetView();
  };

  const hintVisible = isStateOverviewZoom(zoom);

  return (
    <div className="tfx-root">
      <div className="tfx-toolbar">
        <div className="tfx-chips" role="group" aria-label="Transformer status filter">
          {MAP_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`tfx-chip tfx-chip--${opt.value === 'all' ? 'all' : colourForStatusPill(opt.value)}${
                status === opt.value ? ' is-active' : ''
              }`}
              aria-pressed={status === opt.value}
              onClick={() => setStatus(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="tfx-count" data-testid="tfx-count">
          {filtered.length} transformers · {redCount} compromised
        </span>
      </div>

      <div className="tfx-citybar" role="group" aria-label="Quick jump to city">
        <button
          type="button"
          className={`tfx-city${city === null ? ' is-active' : ''}`}
          aria-pressed={city === null}
          onClick={showAll}
        >
          {ALL_CITIES_LABEL}
        </button>
        {CITY_JUMP.map((name) => (
          <button
            key={name}
            type="button"
            className={`tfx-city${city === name ? ' is-active' : ''}`}
            aria-pressed={city === name}
            onClick={() => jumpToCity(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="tfx-mapwrap" data-map-status={mapState}>
        <div className="tfx-map" ref={mapRef} aria-label="Tamil Nadu transformer map" />

        {mapState === 'starting' && (
          <div className="tfx-overlay tfx-hint">Loading map…</div>
        )}

        {hintVisible && mapState === 'ready' && (
          <div className="tfx-overlay tfx-hint" data-testid="tfx-zoom-hint">
            🔍 Zoom in to see individual transformers
          </div>
        )}

        <div className="tfx-legend" aria-label="Map legend">
          <div className="tfx-legend-title">Legend</div>
          <div className="tfx-legend-row">
            <span className="tfx-swatch tfx-swatch--green" /> Verified — all chips OK
          </div>
          <div className="tfx-legend-row">
            <span className="tfx-swatch tfx-swatch--red" /> Compromised — unresolved incident
          </div>
          <div className="tfx-legend-row">
            <span className="tfx-swatch tfx-swatch--grey" /> Unknown — status/location approximate
          </div>
        </div>
      </div>

      {toast && (
        <div className="tfx-toast" role="status" data-testid="tfx-toast">
          {toast}
          <button type="button" className="tfx-toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/** Map a filter-chip value to its legend colour class. */
function colourForStatusPill(value) {
  return { verified: 'green', compromised: 'red', unknown: 'grey' }[value] ?? 'all';
}