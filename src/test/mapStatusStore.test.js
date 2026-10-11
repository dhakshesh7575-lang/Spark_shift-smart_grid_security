// ---------------------------------------------------------------------------
// Step 4 tests: mapStatusStore — the prototype's backend for map colours.
//
// CONTRACT under test:
//   - every row carries `map_status` (verified | compromised | unknown) and it
//     is the ONLY field the map may colour from;
//   - unknown/absent statuses degrade to "unknown" (grey);
//   - resolve() flips a row only when the store confirms; unknown ids are
//     rejected (icon must stay red).
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  getMapTransformers,
  resolveMapTransformer,
  isResolvedInStore,
} from '../data/mapStatusStore';
import { colourForTransformer } from '../logic/transformerMap';

describe('mapStatusStore (backend contract)', () => {
  it('returns every transformer with an explicit map_status', () => {
    const rows = getMapTransformers();
    expect(rows.length).toBeGreaterThan(0);
    for (const t of rows) {
      expect(['verified', 'compromised', 'unknown']).toContain(t.map_status);
      expect(t.simulated).toBe(true);
    }
  });

  it('colours strictly from map_status: verified=green, compromised=red', () => {
    const rows = getMapTransformers();
    const colours = rows.reduce((acc, t) => {
      acc[t.map_status] = (acc[t.map_status] || 0) + 1;
      return acc;
    }, {});
    expect(colours.verified).toBeGreaterThan(0);
    expect(colours.compromised).toBeGreaterThan(0);
    expect(Object.keys(colours)).toEqual(expect.arrayContaining(['verified', 'compromised']));

    // Cross-check: the colour helper must agree with the backend field.
    for (const t of rows) {
      const expected = t.map_status === 'verified' ? 'green' : t.map_status === 'compromised' ? 'red' : 'grey';
      expect(colourForTransformer(t)).toBe(expected);
    }
  });

  it('seed rows are verified or compromised (grey path covered at colour layer)', () => {
    const rows = getMapTransformers();
    for (const t of rows) {
      expect(['verified', 'compromised']).toContain(t.map_status);
    }
  });

  it('resolve flags the row verified + resolved_at/by, flipping colour to green', () => {
    const before = getMapTransformers().find((t) => t.map_status === 'compromised');
    expect(before).toBeDefined();

    const row = resolveMapTransformer(before.id, 'admin');
    expect(row.map_status).toBe('verified');
    expect(row.status).toBe('authorised');
    expect(row.resolved_at).toBeTruthy();
    expect(row.resolved_by).toBe('admin');
    expect(colourForTransformer(row)).toBe('green');
    expect(isResolvedInStore(before.id)).toBe(true);

    // Subsequent reads reflect the resolution.
    const after = getMapTransformers().find((t) => t.id === before.id);
    expect(after.map_status).toBe('verified');
  });

  it('resolve with an UNKNOWN id is rejected (null) so the marker stays red', () => {
    expect(resolveMapTransformer('DOES-NOT-EXIST', 'admin')).toBeNull();
  });
});