// Unit tests for the filter logic (Steps 5 + 6).
// Covers: city autocomplete sorting, ALL CITIES behaviour, status filter,
// and multi-filter combination.
import { describe, it, expect } from 'vitest';
import {
  ALL_CITIES,
  sortCitySuggestions,
  buildCitySuggestions,
  getCityNames,
  filterTransformers,
} from '../logic/transformerFilters';
import { TN_TRANSFORMERS } from '../data/tnebTransformers';

const ALL_NAMES = getCityNames();

describe('city autocomplete sorting (Step 5)', () => {
  it('prefix matches rank before substring matches', () => {
    const results = sortCitySuggestions(ALL_NAMES, 'ra');
    const first = results[0];
    // Every item must actually match, and the top item must be a prefix match.
    expect(results.length).toBeGreaterThan(2);
    expect(first.toLowerCase().startsWith('ra')).toBe(true);
  });

  it('puts the best match at the very top', () => {
    expect(sortCitySuggestions(ALL_NAMES, 'madurai')[0]).toBe('Madurai');
    expect(sortCitySuggestions(ALL_NAMES, 'coimbatore')[0]).toBe('Coimbatore');
    expect(sortCitySuggestions(ALL_NAMES, 'chennai')[0]).toBe('Chennai');
  });

  it('is case-insensitive', () => {
    const lower = sortCitySuggestions(ALL_NAMES, 'SALEM');
    const upper = sortCitySuggestions(ALL_NAMES, 'salem');
    expect(lower).toEqual(upper);
    expect(lower[0]).toBe('Salem');
  });

  it('finds substring matches too', () => {
    const results = sortCitySuggestions(ALL_NAMES, 'pattinam');
    expect(results).toContain('Nagapattinam');
    expect(results.every((c) => c.toLowerCase().includes('pattinam'))).toBe(true);
  });

  it('an empty query returns the full list', () => {
    expect(sortCitySuggestions(ALL_NAMES, '')).toHaveLength(ALL_NAMES.length);
  });
});

describe('ALL CITIES behaviour (Step 5)', () => {
  it('is always pinned to the top of the suggestion list', () => {
    for (const query of ['', 'coi', 'madurai', 'zzzz']) {
      const suggestions = buildCitySuggestions(ALL_NAMES, query);
      expect(suggestions[0], `query "${query}"`).toBe(ALL_CITIES);
    }
  });

  it('does not appear more than once', () => {
    expect(buildCitySuggestions(ALL_NAMES, 'all').filter((c) => c === ALL_CITIES)).toHaveLength(1);
  });
});

describe('status filter (Step 6)', () => {
  it('returns only unauthorised transformers', () => {
    const result = filterTransformers(TN_TRANSFORMERS, { status: 'unauthorised' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.status === 'unauthorised')).toBe(true);
  });

  it('returns only authorised transformers', () => {
    const result = filterTransformers(TN_TRANSFORMERS, { status: 'authorised' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.status === 'authorised')).toBe(true);
  });

  it('"all" and undefined both mean every status', () => {
    expect(filterTransformers(TN_TRANSFORMERS, { status: 'all' })).toHaveLength(
      TN_TRANSFORMERS.length
    );
    expect(filterTransformers(TN_TRANSFORMERS, { status: undefined })).toHaveLength(
      TN_TRANSFORMERS.length
    );
  });
});

describe('multi-filter combination (Step 6)', () => {
  it('combines City + Status filters', () => {
    const result = filterTransformers(TN_TRANSFORMERS, {
      city: 'Coimbatore',
      status: 'unauthorised',
    });
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      expect(t.status).toBe('unauthorised');
      expect(t.city === 'Coimbatore' || t.district === 'Coimbatore').toBe(true);
    }
  });

  it('a single city alone returns only that city, non-empty', () => {
    const result = filterTransformers(TN_TRANSFORMERS, { city: 'Madurai' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.city === 'Madurai' || t.district === 'Madurai')).toBe(true);
  });

  it('ALL CITIES + a status still applies the status', () => {
    const result = filterTransformers(TN_TRANSFORMERS, {
      city: ALL_CITIES,
      status: 'authorised',
    });
    expect(result.every((t) => t.status === 'authorised')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('is forward-compatible: unknown filter categories are ignored', () => {
    const result = filterTransformers(TN_TRANSFORMERS, { capacityKva: 400, status: 'authorised' });
    expect(result.every((t) => t.status === 'authorised')).toBe(true);
  });
});