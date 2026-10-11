// ---------------------------------------------------------------------------
// src/components/sidebar/transformerPopup.js
//
// Pure builder for the Leaflet marker popup HTML. Keeping this DOM-free lets
// tests assert popup content (name, ID, city, district, status badge,
// simulated tag, incident info, resolve button) without a real map.
//
// "Mark as Resolved" is rendered ONLY for red (compromised) transformers AND
// only when the current session is an authenticated admin.
// ---------------------------------------------------------------------------

import {
  MAP_STATUS,
  colourForTransformer,
  deriveMapStatus,
  incidentLabelFor,
  incidentTimestampFor,
  isApproximate,
  isResolved,
  resolvedBy,
} from '../../logic/transformerMap';

/** Prototype flag — the app has no auth flow yet, admins are assumed on. */
export const ADMIN_AUTHENTICATED = true;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/**
 * Build the popup content for one transformer.
 * @param {object} t      transformer row
 * @param {object} [opts] { adminAuthenticated }
 * @returns {string} HTML string suitable for marker.bindPopup()
 */
export function buildMarkerPopupHtml(t, opts = {}) {
  const admin = opts.adminAuthenticated ?? ADMIN_AUTHENTICATED;
  const colour = colourForTransformer(t);
  const status = deriveMapStatus(t);
  const label = colour.toUpperCase();

  const parts = [];
  parts.push('<div class="tfx-popup">');
  parts.push(`<strong class="tfx-popup-name">${esc(t.name)}</strong>`);
  parts.push(`<span class="tfx-popup-id">${esc(t.id)}</span>`);
  parts.push(`<div class="tfx-popup-row">${esc(t.city)}, ${esc(t.district)} district</div>`);
  parts.push(`<span class="status-badge status-badge--${colour}">${esc(label)}</span>`);

  // Demo-data tag — every row in the seed is simulated.
  parts.push('<span class="tfx-sim-tag">Simulated</span>');

  if (isApproximate(t)) {
    parts.push('<div class="tfx-popup-note">Approximate location</div>');
  }

  // Incident info — only present when the data actually carries it.
  const incId = incidentLabelFor(t);
  const incTs = incidentTimestampFor(t);
  if (status === MAP_STATUS.COMPROMISED) {
    if (incId || incTs) {
      parts.push(
        `<div class="tfx-popup-inc">Last incident: ${incId ? esc(incId) : '—'}${incTs ? ` • ${esc(incTs)}` : ''}</div>`
      );
    } else {
      parts.push('<div class="tfx-popup-inc">Last incident: no record attached</div>');
    }
  }

  if (isResolved(t)) {
    const by = resolvedBy(t);
    parts.push(
      `<div class="tfx-popup-resolved">Resolved at ${esc(t.resolved_at ?? t.resolvedAt)}${by ? ` by ${esc(by)}` : ''}</div>`
    );
  }

  parts.push(
    '<a href="#" class="tfx-popup-link" data-tfx-action="view-incidents">View Incidents →</a>'
  );

  // Resolve action: ONLY red + authenticated admin.
  if (status === MAP_STATUS.COMPROMISED && admin) {
    parts.push(
      `<button type="button" class="tfx-popup-resolve" data-tfx-action="resolve" data-tfx-id="${esc(t.id)}">Mark as Resolved</button>`
    );
  }

  parts.push('</div>');
  return parts.join('');
}