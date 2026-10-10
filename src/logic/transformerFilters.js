// ---------------------------------------------------------------------------
// src/logic/transformerFilters.js
//
// Pure, testable filter logic for the Transformers sidebar panel.
//
// Design goal: the filter system is a MAP of { category -> value }. Adding a
// new filter category later only requires registering a predicate below — the
// filterTransformers() combinator and the UI state that feeds it never change.
//
// Current categories:
//   city   -> string | null | ALL_CITIES ('__ALL__')  (matches city OR district)
//   status -> 'all' | 'authorised' | 'unauthorised'
// ---------------------------------------------------------------------------

import { TN_LOCATIONS } from '../data/tnebTransformers';

/** Sentinel meaning "show transformers across every city". */
export const ALL_CITIES = '__ALL__';

/** Human-readable label shown for the ALL CITIES option. */
export const ALL_CITIES_LABEL = 'ALL CITIES';

/** The three position toggle options for the status filter row. */
export const STATUS_OPTIONS = [
  { value: 'all', label: 'ALL' },
  { value: 'unauthorised', label: 'UNAUTHORISED' },
  { value: 'authorised', label: 'AUTHORISED' },
];

/** Case-fold + trim used for all comparisons. */
export function normalize(s) {
  return String(s ?? '').trim().toLowerCase();
}

/** Sorted, unique list of city/district names from the TN dataset. */
export function getCityNames() {
  return Array.from(new Set(TN_LOCATIONS.map((l) => l.name))).sort((a, b) =>
    a.localeCompare(b)
  );
}

/**
 * Sort matching cities for the autocomplete list.
 *
 * Ordering rules:
 *   1. Prefix matches rank before substring matches.
 *   2. Among equal rank, the match that starts earliest in the name wins.
 *   3. Ties break alphabetically.
 * The single best match therefore always ends up at the very top.
 *
 * @param {string[]} cities Full list of city names.
 * @param {string} query    The partial text typed by the user.
 * @returns {string[]} Matched + sorted city names.
 */
export function sortCitySuggestions(cities, query) {
  const q = normalize(query);
  const scored = cities
    .filter((c) => !q || normalize(c).includes(q))
    .map((c) => {
      const idx = normalize(c).indexOf(q);
      return { name: c, idx, rank: idx === 0 ? 0 : 1 };
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.idx !== b.idx) return a.idx - b.idx;
      return a.name.localeCompare(b.name);
    });
  return scored.map((s) => s.name);
}

/**
 * Build the full suggestion list shown to the user, with the "ALL CITIES"
 * option permanently pinned to the top.
 *
 * @param {string[]} cities
 * @param {string} query
 * @returns {string[]} [ALL_CITIES, ...sortedMatchingCities]
 */
export function buildCitySuggestions(cities, query) {
  return [ALL_CITIES, ...sortCitySuggestions(cities, query)];
}

/**
 * Predicates keyed by filter-category. A transforming function that cannot be
 * expressed as a one-line predicate can go here or in a dedicated module.
 */
const PREDICATES = {
  /** A transformer belongs to a location if its city OR district matches. */
  city: (t, value) =>
    value == null || value === '' || value === ALL_CITIES || t.city === value || t.district === value,
  status: (t, value) =>
    value == null || value === '' || value === 'all' || t.status === value,
};

/**
 * Apply a set of filters to the dataset.
 *
 * @param {object[]} transformers The dataset (e.g. TN_TRANSFORMERS).
 * @param {object}   filters      Map of {category: value}.
 * @returns {object[]} Filtered transformers.
 */
export function filterTransformers(transformers, filters = {}) {
  return transformers.filter((t) =>
    Object.entries(filters).every(([category, value]) => {
      const predicate = PREDICATES[category];
      // Unknown categories are ignored, making the system forward-compatible.
      return predicate ? predicate(t, value) : true;
    })
  );
}