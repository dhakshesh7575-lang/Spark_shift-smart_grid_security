// Unit tests for the TNEB transformer seed dataset (Step 4).
import { describe, it, expect } from 'vitest';
import {
  TN_TRANSFORMERS,
  TN_LOCATIONS,
  TN_DISTRICTS,
  CAPACITIES_KVA,
} from '../data/tnebTransformers';
import { TRANSFORMERS } from '../logic/constants';

/** A transformer "belongs" to a location if it matches the city or district. */
const inLocation = (t, name) => t.city === name || t.district === name;

describe('TNEB transformer dataset', () => {
  it('is re-exported from constants (single source of truth)', () => {
    expect(TRANSFORMERS).toBe(TN_TRANSFORMERS);
  });

  it('has unique location names', () => {
    const names = TN_LOCATIONS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every city/location a non-empty transformer list', () => {
    for (const loc of TN_LOCATIONS) {
      const matches = TN_TRANSFORMERS.filter((t) => inLocation(t, loc.name));
      expect(matches.length, `${loc.name} should have transformers`).toBeGreaterThan(0);
    }
  });

  it('gives every city both an authorised AND an unauthorised transformer', () => {
    for (const loc of TN_LOCATIONS) {
      const matches = TN_TRANSFORMERS.filter((t) => inLocation(t, loc.name));
      expect(matches.some((t) => t.status === 'authorised'), loc.name).toBe(true);
      expect(matches.some((t) => t.status === 'unauthorised'), loc.name).toBe(true);
    }
  });

  it('represents all 38 Tamil Nadu districts', () => {
    expect(TN_DISTRICTS.length).toBe(38);
    const represented = new Set([
      ...TN_LOCATIONS.map((l) => l.name),
      ...TN_LOCATIONS.map((l) => l.district),
    ]);
    for (const d of TN_DISTRICTS) {
      expect(represented.has(d), `district ${d} must be selectable`).toBe(true);
    }
  });

  it('has a valid, well-formed record for every transformer', () => {
    for (const t of TN_TRANSFORMERS) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.prefix).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(typeof t.city).toBe('string');
      expect(['authorised', 'unauthorised']).toContain(t.status);
      expect(CAPACITIES_KVA).toContain(t.capacityKva);
      expect(typeof t.feeder).toBe('string');
      expect(typeof t.lastInspected).toBe('string');
      expect(typeof t.location.lat).toBe('number');
      expect(typeof t.location.lng).toBe('number');
    }
  });

  it('has unique ids and prefixes', () => {
    const ids = TN_TRANSFORMERS.map((t) => t.id);
    const prefixes = TN_TRANSFORMERS.map((t) => t.prefix);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('keeps prefixes as exactly two dash-separated tokens (parser contract)', () => {
    for (const t of TN_TRANSFORMERS) {
      expect(t.prefix.split('-').length, t.prefix).toBe(2);
    }
  });
});
