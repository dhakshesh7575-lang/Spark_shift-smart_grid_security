// src/components/sidebar/TransformersPanel.jsx
//
// The "Transformers" page shown inside the sidebar drawer.
//
// Filter workflow:
//   1. CITY (first filter — must be chosen before anything is listed).
//   2. Once a city is chosen, the secondary row appears: ALL / UNAUTHORISED /
//      AUTHORISED (default ALL). Both filters combine via filterTransformers().
//
// State is local to this panel. Supported multi-filter design: the filters
// object is a {category: value} map, so new categories can be added later.
//
// Loading/error handling: the dataset is a static, client-side seed, so there
// is no async loading; a defensive guard renders an error box if the dataset
// is ever empty, and per-city no-results render a friendly empty state.

import { useMemo, useState } from 'react';
import CityFilter from './CityFilter';
import StatusFilter from './StatusFilter';
import TransformerList from './TransformerList';
import {
  ALL_CITIES,
  ALL_CITIES_LABEL,
  filterTransformers,
} from '../../logic/transformerFilters';
import { TN_TRANSFORMERS } from '../../data/tnebTransformers';

export default function TransformersPanel({ onClose }) {
  // city: null = not chosen yet; ALL_CITIES = every city; otherwise a location.
  const [city, setCity] = useState(null);
  const [status, setStatus] = useState('all');

  const cityChosen = city != null;
  const broken = !Array.isArray(TN_TRANSFORMERS) || TN_TRANSFORMERS.length === 0;

  const filtered = useMemo(
    () =>
      cityChosen && !broken ? filterTransformers(TN_TRANSFORMERS, { city, status }) : [],
    [cityChosen, city, status, broken]
  );

  const cityLabel =
    city === ALL_CITIES ? ALL_CITIES_LABEL : city == null ? '' : String(city);

  if (broken) {
    return (
      <div className="transformers-panel">
        <header className="drawer-header">
          <h3 className="drawer-title">TRANSFORMERS</h3>
          <button
            type="button"
            className="drawer-close"
            aria-label="Close Transformers panel"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="transformers-error" role="alert">
          Transformer dataset unavailable. Please try again later.
        </div>
      </div>
    );
  }

  return (
    <div className="transformers-panel">
      <header className="drawer-header">
        <h3 className="drawer-title">TRANSFORMERS</h3>
        <span className="drawer-sub">Tamil Nadu EB registry</span>
        <button
          type="button"
          className="drawer-close"
          aria-label="Close Transformers panel"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="drawer-body">
        <label className="filter-label" htmlFor="city-filter">
          Filter by City
        </label>
        <CityFilter value={city} onSelect={setCity} />

        {cityChosen ? (
          <>
            <div className="status-filter-row">
              <StatusFilter value={status} onChange={setStatus} />
              <span className="result-count">{filtered.length} shown</span>
            </div>
            <TransformerList transformers={filtered} cityLabel={cityLabel} />
          </>
        ) : (
          <div className="transformer-empty prompt">
            Choose a city, or{' '}
            <button type="button" className="link-btn" onClick={() => setCity(ALL_CITIES)}>
              ALL CITIES
            </button>{' '}
            to list every transformer.
          </div>
        )}
      </div>
    </div>
  );
}