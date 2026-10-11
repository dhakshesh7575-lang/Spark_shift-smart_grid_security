// ---------------------------------------------------------------------------
// src/data/mapStatusStore.js
//
// Mock map backend for the prototype. The real deployment's GET
// /api/transformers + POST /api/transformers/{id}/resolve return exactly this
// shape; here the store stands in for that HTTP layer so the map keeps
// working fully offline.
//
// CONTRACT (Step 4):
//   - Every row the store returns carries `map_status`:
//       "verified"    (green)
//       "compromised" (red)
//       "unknown"     (grey)
//   - The map colours STRICTLY from `map_status` — never from any other field.
//   - Resolve flips only after the store confirms (returns the updated row).
// ---------------------------------------------------------------------------

import { TN_TRANSFORMERS } from './tnebTransformers';

/** id -> { resolved_at, resolved_by } — the store's "database". */
const RESOLVED = new Map();

function deriveMapStatus(t) {
  if (typeof t.map_status === 'string' && t.map_status !== '') return t.map_status;
  if (t.status === 'unauthorised') return 'compromised';
  if (t.status === 'authorised') return 'verified';
  return 'unknown';
}

/**
 * Return every transformer with an explicit `map_status` attached (the shape a
 * real backend would send, including `simulated: true` for the demo seed).
 */
export function getMapTransformers() {
  return TN_TRANSFORMERS.map((t) => {
    const row = {
      ...t,
      map_status: deriveMapStatus(t),
      simulated: true,
    };
    const res = RESOLVED.get(t.id);
    if (res) {
      row.map_status = 'verified';
      row.status = 'authorised';
      row.resolved_at = res.resolved_at;
      row.resolved_by = res.resolved_by;
    }
    return row;
  });
}

/**
 * POST /api/transformers/{id}/resolve equivalent. Marks the transformer
 * resolved and returns the updated row (backend confirms), or null if the id
 * is unknown (backend rejects — the icon must stay red).
 */
export function resolveMapTransformer(id, by = 'admin') {
  const t = TN_TRANSFORMERS.find((x) => x.id === id);
  if (!t) return null;
  RESOLVED.set(id, { resolved_at: new Date().toISOString(), resolved_by: by });
  const res = RESOLVED.get(id);
  return {
    ...t,
    map_status: 'verified',
    status: 'authorised',
    simulated: true,
    resolved_at: res.resolved_at,
    resolved_by: res.resolved_by,
  };
}

/** Test/observer helper: whether an id has been resolved in this session. */
export function isResolvedInStore(id) {
  return RESOLVED.has(id);
}