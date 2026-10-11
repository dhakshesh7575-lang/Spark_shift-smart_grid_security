export function generateIncidentId() {
  return 'INC-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * Normalise an optional GSM network identifier (LAC / Cell ID).
 * Accepts a string or a finite number; trims strings and maps
 * null / undefined / empty / blank strings to null. Never returns
 * "undefined". This keeps the null-handling convention consistent
 * across the model, the API and the renderers.
 */
function normaliseNetworkId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function createSecurityEvent(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id || generateIncidentId(),
    eventType: data.eventType || 'ACCESS_REJECTION',
    timestamp: data.timestamp || now,
    transformerId: data.transformerId || null,
    rejectReason: data.rejectReason || null,
    // Optional GSM fallback fields (only populated when Wi-Fi SSID is absent).
    lac: normaliseNetworkId(data.lac),
    cell_id: normaliseNetworkId(data.cell_id),
    eventData: data.eventData || {},
    createdAt: now,
    updatedAt: now
  };
}
