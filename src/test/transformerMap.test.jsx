// ---------------------------------------------------------------------------
// Step 2 tests: Tamil Nadu transformer map.
//   - pure logic   (icon sizing, colours, clustering split, filters)
//   - popup builder ("Mark as Resolved" only for red + admin)
//   - Leaflet engine via an injected fake L (jsdom cannot lay out Leaflet)
//   - component chrome (legend, chips, quick-jump, count) rendered by React
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TransformerMap from '../components/sidebar/TransformerMap';
import { buildMarkerPopupHtml } from '../components/sidebar/transformerPopup';
import { createMapEngine } from '../components/sidebar/mapEngine';
import { filterTransformersForMap, iconSizeForZoom, labelVisibleForZoom } from '../logic/transformerMap';
import * as tm from '../logic/transformerMap';
import { TN_TRANSFORMERS } from '../data/tnebTransformers';

// ---------------- helpers ----------------

const mk = (id, status, extra = {}) => ({
  id,
  name: `${id} feeder`,
  label: `${id} feeder`,
  city: 'Coimbatore',
  district: 'Coimbatore',
  status,
  capacityKva: 100,
  feeder: 'Test Feeder',
  location: { lat: 11.0168, lng: 76.9558 },
  ...extra,
});

const green = (id) => mk(id, 'authorised');
const red = (id) => mk(id, 'unauthorised');

/** A minimal fake Leaflet surface backed by plain objects (plus spies). */
function makeFakeL() {
  const markers = new Map();
  const map = {
    _center: null,
    _zoom: 0,
    _opts: null,
    _handlers: {},
    _layers: [],
    setView(center, zoom) {
      this._center = center;
      this._zoom = zoom;
      return this;
    },
    getZoom() {
      return this._zoom;
    },
    getCenter() {
      return this._center;
    },
    addLayer(l) {
      this._layers.push(l);
      return this;
    },
    removeLayer(l) {
      this._layers = this._layers.filter((x) => x !== l);
      return this;
    },
    on(evt, fn) {
      this._handlers[evt] = fn;
      return this;
    },
    flyTo(center, zoom) {
      this._center = center;
      this._zoom = zoom;
      return this;
    },
    remove() {},
  };

  const fakeL = {
    _map: map,
    tileAddedTo: null,
    map: (container, opts) => {
      map._opts = opts;
      return map;
    },
    tileLayer: () => {
      const tl = {
        addTo(m) {
          fakeL.tileAddedTo = m;
          return tl;
        },
      };
      return tl;
    },
    divIcon: (cfg) => ({ ...cfg, _html: cfg.html }),
    layerGroup: () => {
      const layers = { items: [], addLayer(l) { this.items.push(l); return this; }, clearLayers() { this.items.length = 0; } };
      return {
        _store: layers,
        addTo(m) { m.addLayer(this); return this; },
        addLayer(l) { layers.addLayer(l); return this; },
        clearLayers() { layers.clearLayers(); },
      };
    },
    marker: (latlng, opts) => {
      const m = {
        _latlng: latlng,
        _opts: opts,
        _icon: opts.icon,
        _popup: null,
        _handlers: {},
        setIcon: vi.fn(function (icon) { this._icon = icon; return this; }),
        bindPopup(html) { this._popup = html; return this; },
        on(evt, fn) { this._handlers[evt] = fn; return this; },
        addTo(layer) { layer.addLayer(this); return this; },
      };
      markers.set(latlng, m);
      return m;
    },
  };
  return fakeL;
}

function makeFakeCluster() {
  let cfg = null;
  const factory = (c) => {
    cfg = c;
    const store = [];
    return {
      _cfg: cfg,
      _store: store,
      addTo(m) {
        m.addLayer(this);
        return this;
      },
      addLayer(l) {
        store.push(l);
        return this;
      },
      clearLayers() {
        store.length = 0;
      },
    };
  };
  factory.lastCfg = () => cfg;
  return factory;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- pure logic ----------------

describe('transformerMap logic', () => {
  it('icon size bands match the zoom contract', () => {
    expect(iconSizeForZoom(7)).toEqual({ width: 20, height: 26 });
    expect(iconSizeForZoom(10)).toEqual({ width: 24, height: 30 });
    expect(iconSizeForZoom(13)).toEqual({ width: 30, height: 38 });
    expect(iconSizeForZoom(16)).toEqual({ width: 36, height: 46 });
    expect(iconSizeForZoom(19)).toEqual({ width: 36, height: 46 });
  });

  it('labels only appear at zoom >= 13', () => {
    expect(labelVisibleForZoom(7)).toBe(false);
    expect(labelVisibleForZoom(12)).toBe(false);
    expect(labelVisibleForZoom(13)).toBe(true);
    expect(labelVisibleForZoom(16)).toBe(true);
  });

  it('colours: verified=green, compromised=red, unknown=grey, unknown-string=grey+warn', () => {
    expect(tm.getColourForStatus('verified')).toBe('green');
    expect(tm.getColourForStatus('compromised')).toBe('red');
    expect(tm.getColourForStatus('unknown')).toBe('grey');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(tm.getColourForStatus('weird-value')).toBe('grey');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('deriveMapStatus uses backend map_status first, then seed status', () => {
    expect(tm.deriveMapStatus(mk('T1', 'authorised', { map_status: 'compromised' }))).toBe('compromised');
    expect(tm.deriveMapStatus(mk('T2', 'authorised'))).toBe('verified');
    expect(tm.deriveMapStatus(mk('T3', 'unauthorised'))).toBe('compromised');
    expect(tm.deriveMapStatus({ id: 'X' })).toBe('unknown');
  });

  it('red markers are ALWAYS split out of clustering; grey stays clustered', () => {
    const { clustered, alwaysIndividual } = tm.splitForClustering([
      green('G1'),
      red('R1'),
      green('G2'),
      mk('R2', 'unexpected-status'), // unknown -> grey, clustered (never red)
    ]);
    expect(clustered.map((t) => t.id)).toEqual(['G1', 'G2', 'R2']);
    expect(alwaysIndividual.map((t) => t.id)).toEqual(['R1']);
  });

  it('cluster border: red if any red member, green if all green, grey otherwise', () => {
    expect(tm.clusterBorderColour([green('a'), red('b')])).toBe('red');
    expect(tm.clusterBorderColour([green('a'), green('b')])).toBe('green');
    expect(tm.clusterBorderColour([green('a'), mk('c', 'whatever')])).toBe('grey');
  });

  it('15 quick-jump cities in the requested order + All Tamil Nadu sentinel', () => {
    expect(tm.CITY_JUMP).toEqual([
      'Chennai', 'Coimbatore', 'Madurai', 'Trichy', 'Salem', 'Tirunelveli',
      'Erode', 'Vellore', 'Thoothukudi', 'Thanjavur', 'Tiruppur', 'Dindigul',
      'Nagercoil', 'Hosur', 'Kanchipuram',
    ]);
    expect(tm.ALL_CITIES_LABEL).toBe('All Tamil Nadu');
  });

  it('map filter composes city + status', () => {
    const rows = [
      mk('A', 'authorised', { city: 'Chennai' }),
      mk('B', 'unauthorised', { city: 'Coimbatore' }),
      mk('C', 'authorised', { city: 'Coimbatore' }),
    ];
    expect(filterTransformersForMap(rows, { city: 'Coimbatore', status: 'compromised' }).map((t) => t.id)).toEqual(['B']);
    expect(filterTransformersForMap(rows, { city: 'Coimbatore', status: 'all' }).map((t) => t.id)).toEqual(['B', 'C']);
    expect(filterTransformersForMap(rows, { city: null, status: 'all' })).toHaveLength(3);
  });

  it('full dataset: every transformer resolves to a known colour', () => {
    const bad = TN_TRANSFORMERS.filter((t) => !['green', 'red', 'grey'].includes(tm.colourForTransformer(t)));
    expect(bad).toEqual([]);
    const counts = TN_TRANSFORMERS.reduce((acc, t) => {
      acc[tm.colourForTransformer(t)] = (acc[tm.colourForTransformer(t)] || 0) + 1;
      return acc;
    }, {});
    expect(counts.green).toBeGreaterThan(0);
    expect(counts.red).toBeGreaterThan(0);
  });
});

// ---------------- popup builder ----------------

describe('marker popup', () => {
  it('red + admin -> includes Mark as Resolved and incident line', () => {
    const html = buildMarkerPopupHtml(red('TN-TRF-0100'));
    expect(html).toContain('Mark as Resolved');
    expect(html).toContain('Simulated');
    expect(html).toContain('View Incidents');
    expect(html).toMatch(/RED/); // colour badge, matches legend
    expect(html).not.toMatch(/VERIFIED/);
  });

  it('green -> no resolve button', () => {
    expect(buildMarkerPopupHtml(green('G1'))).not.toContain('Mark as Resolved');
  });

  it('red but NOT authenticated admin -> no resolve button', () => {
    expect(buildMarkerPopupHtml(red('R1'), { adminAuthenticated: false })).not.toContain('Mark as Resolved');
  });

  it('status unknown -> grey badge, no resolve button, approximate note', () => {
    const html = buildMarkerPopupHtml(mk('U1', 'whatever'));
    expect(html).toMatch(/GREY/);
    expect(html).not.toContain('Mark as Resolved');
    expect(html).toContain('Approximate location');
  });

  it('resolved transformer shows resolved info', () => {
    const html = buildMarkerPopupHtml(mk('R2', 'unauthorised', { resolved_at: '2024-05-01T10:00:00Z', resolved_by: 'admin' }));
    expect(html).toContain('Resolved at');
    expect(html).toContain('admin');
  });
});

// ---------------- Leaflet engine (fake L) ----------------

describe('Tamil Nadu map engine', () => {
  let fakeL;
  let clusterFactory;

  beforeEach(() => {
    fakeL = makeFakeL();
    clusterFactory = makeFakeCluster();
  });

  it('builds the map centred on TN at zoom 7 with 6..19 zoom limits + tile layer', () => {
    const engine = createMapEngine(fakeL, clusterFactory, { container: {} });
    expect(fakeL._map._center).toEqual([11.1271, 78.6569]);
    expect(fakeL._map._zoom).toBe(7);
    expect(fakeL._map._opts.minZoom).toBe(6);
    expect(fakeL._map._opts.maxZoom).toBe(19);
    expect(fakeL.tileAddedTo).toBe(fakeL._map);
    engine.destroy();
  });

  it('renders red markers individually and green markers into the cluster', () => {
    const engine = createMapEngine(fakeL, clusterFactory, { container: {} });
    const result = engine.render([green('G1'), red('R1'), green('G2')]);
    expect(result).toEqual({ clustered: 2, alwaysIndividual: 1 });

    expect(engine.cluster._store).toHaveLength(2); // green only
    expect(engine.redLayer._store.items).toHaveLength(1);
    expect(engine.redLayer._store.items[0].__tfx.id).toBe('R1');
    engine.destroy();
  });

  it('binds a popup containing Mark as Resolved for the red marker', () => {
    const engine = createMapEngine(fakeL, clusterFactory, {
      container: {},
      popupRenderer: (t) => buildMarkerPopupHtml(t),
    });
    engine.render([green('G1'), red('R1')]);
    const redMarker = engine.redLayer._store.items[0];
    expect(redMarker._popup).toContain('Mark as Resolved');
    expect(redMarker._popup).toContain(redMarker.__tfx.id);
    engine.destroy();
  });

  it('zoomend crosses an icon band and rebuilds markers 36x46 + labels (debounced)', async () => {
    const stateChanges = [];
    const engine = createMapEngine(fakeL, clusterFactory, {
      container: {},
      onStateChange: (s) => stateChanges.push(s),
    });
    engine.render([green('G1'), green('G2')]);
    const smallBefore = engine.cluster._store[0]._icon._html;
    expect(smallBefore).toContain('width:20px;height:26px');

    fakeL._map._zoom = 16; // band 1 (<=8) -> band 4 (>=15)
    fakeL._map._handlers.zoomend();
    fakeL._map._handlers.zoomend(); // two rapid events -> one rebuild after debounce
    await sleep(150);

    expect(engine.cluster._store[0]._icon._html).toContain('width:36px;height:46px');
    expect(engine.cluster._store[0]._icon._html).toContain('tfx-label');
    expect(stateChanges.filter((s) => s.zoom === 16)).toHaveLength(1);
    expect(stateChanges[0].labelsVisible).toBe(true);
    engine.destroy();
  });

  it('cluster icons get a green border for all-green members', () => {
    const engine = createMapEngine(fakeL, clusterFactory, { container: {} });
    engine.render([green('G1'), green('G2')]);
    const cluster = engine.cluster;
    const icon = cluster._cfg.iconCreateFunction({
      getChildCount: () => cluster._store.length,
      getAllChildMarkers: () => cluster._store,
    });
    expect(icon._html).toContain('tfx-cluster--green');
    engine.destroy();
  });

  it('cluster config: disableClusteringAtZoom is 12 (clustering only low zoom)', () => {
    const engine = createMapEngine(fakeL, clusterFactory, { container: {} });
    expect(engine.cluster._cfg.disableClusteringAtZoom).toBe(12);
    engine.destroy();
  });

  it('at zoom 7, 500 green + 3 red -> 3 red shown individually, cluster has ZERO red', () => {
    const many = [];
    for (let i = 0; i < 500; i += 1) many.push(green(`G${String(i).padStart(3, '0')}`));
    many.push(red('R1'), red('R2'), red('R3'));

    const engine = createMapEngine(fakeL, clusterFactory, { container: {} });
    const result = engine.render(many);

    expect(result.alwaysIndividual).toBe(3);
    expect(result.clustered).toBe(500);

    // The cluster group must never contain a red marker.
    const redInsideCluster = engine.cluster._store.filter((m) => m.__tfx && m.__tfx.status === 'unauthorised');
    expect(redInsideCluster).toEqual([]);
    expect(engine.redLayer._store.items.map((m) => m.__tfx.id)).toEqual(['R1', 'R2', 'R3']);
    engine.destroy();
  });

  it('at zoom >= 12 clustering is disabled (individual icons always show)', () => {
    const engine = createMapEngine(fakeL, clusterFactory, { container: {} });
    const result = engine.render([green('G1'), green('G2'), red('R1')]);
    expect(result.clustered).toBe(2);
    expect(result.alwaysIndividual).toBe(1);

    fakeL._map._zoom = 12;
    expect(engine.cluster._cfg.disableClusteringAtZoom).toBe(12);
    // When Leaflet hits disableClusteringAtZoom the cluster group shows children
    // individually — the config is what guarantees it, asserted above.
    engine.destroy();
  });

  it('flyTo / resetView move the view', () => {
    const engine = createMapEngine(fakeL, clusterFactory, { container: {} });
    engine.flyTo(11.0168, 76.9558, 12);
    expect(fakeL._map._center).toEqual([11.0168, 76.9558]);
    expect(fakeL._map._zoom).toBe(12);
    engine.resetView();
    expect(fakeL._map._zoom).toBe(7);
    engine.destroy();
  });

  it('flipToResolved re-renders: marker leaves redLayer, rejoins cluster as green with a fresh popup', () => {
    const engine = createMapEngine(fakeL, clusterFactory, {
      container: {},
      popupRenderer: (t) => buildMarkerPopupHtml(t),
    });
    engine.render([red('R1'), green('G1')]);
    expect(engine.redLayer._store.items).toHaveLength(1);
    expect(engine.cluster._store).toHaveLength(1);

    expect(engine.flipToResolved('R1')).toBe(true);

    // Re-render moved the resolved marker into the cluster as a GREEN marker.
    expect(engine.redLayer._store.items).toHaveLength(0);
    expect(engine.cluster._store).toHaveLength(2);
    const resolvedMarker = engine.cluster._store.find((m) => m.__tfx.id === 'R1');
    expect(resolvedMarker._icon._html).toContain('tfx-marker--green');
    expect(resolvedMarker._popup).not.toContain('Mark as Resolved');
    engine.destroy();
  });

  it('flipToResolved returns false for an unknown id (backend rejected)', () => {
    const engine = createMapEngine(fakeL, clusterFactory, { container: {} });
    engine.render([green('G1')]);
    expect(engine.flipToResolved('UNKNOWN-ID')).toBe(false);
    engine.destroy();
  });
});

// ---------------- component chrome (jsdom) ----------------

describe('TransformerMap component chrome', () => {
  it('renders filter chips, legend, quick-jump cities and the map container', () => {
    render(<TransformerMap />);
    const chips = screen.getByRole('group', { name: 'Transformer status filter' });
    expect(chips).toHaveTextContent('All');
    expect(chips).toHaveTextContent('Verified');
    expect(chips).toHaveTextContent('Compromised');
    expect(chips).toHaveTextContent('Unknown');

    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText(/Verified — all chips OK/i)).toBeInTheDocument();
    expect(screen.getByText(/Compromised — unresolved incident/i)).toBeInTheDocument();
    expect(screen.getByText(/Unknown — status\/location approximate/i)).toBeInTheDocument();

    const cityGroup = screen.getByRole('group', { name: 'Quick jump to city' });
    expect(cityGroup).toHaveTextContent('All Tamil Nadu');
    expect(cityGroup).toHaveTextContent('Chennai');
    expect(cityGroup).toHaveTextContent('Coimbatore');
    expect(cityGroup).toHaveTextContent('Kanchipuram');

    // In jsdom the container measures 0x0, so the engine is (correctly) not started.
    expect(document.querySelector('.tfx-mapwrap').getAttribute('data-map-status')).toBe('unavailable');
  });

  it('uses the full dataset by default (156 transformers)', () => {
    render(<TransformerMap />);
    expect(screen.getByTestId('tfx-count').textContent).toContain('156 transformers');
  });

  it('clicking Coimbatore filters the count and highlights the button', () => {
    render(<TransformerMap />);
    fireEvent.click(screen.getByRole('button', { name: 'Coimbatore' }));
    const expected = filterTransformersForMap(TN_TRANSFORMERS, { city: 'Coimbatore', status: 'all' }).length;
    expect(screen.getByTestId('tfx-count').textContent).toContain(`${expected} transformers`);
    expect(screen.getByRole('button', { name: 'Coimbatore' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All Tamil Nadu' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('status chips compose with city filter', () => {
    render(<TransformerMap />);
    fireEvent.click(screen.getByRole('button', { name: 'Coimbatore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compromised' }));
    const expected = filterTransformersForMap(TN_TRANSFORMERS, { city: 'Coimbatore', status: 'compromised' }).length;
    expect(screen.getByTestId('tfx-count').textContent).toContain(`${expected} transformers`);
  });

  it('renders all 15 quick-jump cities + All Tamil Nadu', () => {
    render(<TransformerMap />);
    const cityGroup = screen.getByRole('group', { name: 'Quick jump to city' });
    for (const name of tm.CITY_JUMP) {
      expect(cityGroup).toHaveTextContent(name);
    }
    const buttons = cityGroup.querySelectorAll('button');
    expect(buttons.length).toBe(16); // 15 cities + All Tamil Nadu
  });

  it('All Tamil Nadu resets the city filter', () => {
    render(<TransformerMap />);
    fireEvent.click(screen.getByRole('button', { name: 'Coimbatore' }));
    expect(screen.getByTestId('tfx-count').textContent).toContain(
      `${filterTransformersForMap(TN_TRANSFORMERS, { city: 'Coimbatore', status: 'all' }).length} transformers`
    );
    fireEvent.click(screen.getByRole('button', { name: 'All Tamil Nadu' }));
    expect(screen.getByTestId('tfx-count').textContent).toContain('156 transformers');
    expect(screen.getByRole('button', { name: 'All Tamil Nadu' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Coimbatore' })).toHaveAttribute('aria-pressed', 'false');
  });
});