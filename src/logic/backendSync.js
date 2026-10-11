// ---------------------------------------------------------------------------
// src/logic/backendSync.js
//
// Optional helper that pulls SMS alerts from the backend (server/src/smsServer)
// so the dashboard can display real provider responses when REAL_SMS is
// configured. Safe by default: with no backend URL it does nothing and never
// throws. fetch is injectable for tests.
// ---------------------------------------------------------------------------

/** Strip trailing slashes from a base URL. */
function trim(url) {
  return String(url || '').replace(/\/+$/, '');
}

/**
 * Fetch alerts from the backend's GET /api/alerts.
 * @returns {Promise<{ok, reason, alerts, mode}>} — never throws.
 */
export async function fetchBackendAlerts(backendUrl, fetchImpl = globalThis.fetch) {
  const base = trim(backendUrl);
  if (!base) return { ok: false, reason: 'backend not configured', alerts: [], mode: null };
  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'fetch is unavailable', alerts: [], mode: null };
  }

  try {
    const res = await fetchImpl(`${base}/api/alerts`, {
      headers: { Accept: 'application/json' },
    });
    if (!res || !res.ok) {
      return { ok: false, reason: `backend HTTP ${res ? res.status : 'error'}`, alerts: [], mode: null };
    }
    const data = await res.json();
    const alerts = data && Array.isArray(data.alerts) ? data.alerts : [];
    return { ok: true, reason: null, alerts, mode: data ? data.mode : null };
  } catch (err) {
    return {
      ok: false,
      reason: err && err.message ? err.message : 'backend unreachable',
      alerts: [],
      mode: null,
    };
  }
}
