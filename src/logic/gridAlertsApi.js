// ---------------------------------------------------------------------------
// src/logic/gridAlertsApi.js
//
// Optional client for the grid-alert backend routes on server/src/smsServer.mjs.
//
// The dashboard NEVER holds SMS-provider credentials and NEVER chooses the
// recipient — it only forwards a validated alert to the backend, which owns
// the provider key and the authorised admin number. If real SMS is not
// configured the backend answers with a DEMO status and nothing is sent.
//
// `fetchImpl` is injectable so tests need no network. This module never throws.
// ---------------------------------------------------------------------------

import { ALERT_STATUS } from './gridDemo';

/** Strip trailing slashes. */
function trim(url) {
  return String(url || '').replace(/\/+$/, '');
}

/** Map a backend status code to a dashboard label (never over-claims). */
export function mapBackendStatus(code) {
  switch (code) {
    case 'DEMO_NOT_SENT':
      return ALERT_STATUS.DEMO_NOT_SENT;
    case 'SMS_REQUEST_ACCEPTED':
      return ALERT_STATUS.SMS_REQUEST_ACCEPTED;
    case 'FAILED_NOT_SENT':
      return ALERT_STATUS.FAILED_NOT_SENT;
    case 'QUEUED_OFFLINE':
      return ALERT_STATUS.QUEUED_OFFLINE;
    default:
      return ALERT_STATUS.FAILED_NOT_SENT;
  }
}

/**
 * POST a grid alert to the backend.
 * @returns {Promise<{ok, statusLabel, providerResponse, reason}>} — never throws.
 */
export async function postGridAlert(backendUrl, alert, fetchImpl = globalThis.fetch) {
  const base = trim(backendUrl);
  if (!base) return { ok: false, statusLabel: ALERT_STATUS.DEMO_NOT_SENT, providerResponse: null, reason: 'backend not configured' };
  if (typeof fetchImpl !== 'function') {
    return { ok: false, statusLabel: ALERT_STATUS.FAILED_NOT_SENT, providerResponse: null, reason: 'fetch unavailable' };
  }

  try {
    const res = await fetchImpl(`${base}/api/grid-alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        alertId: alert.alertId,
        meterId: alert.meterId,
        meterName: alert.meterName,
        location: alert.location,
        reading: alert.reading,
        reason: alert.reason,
        timestamp: alert.timestamp,
        connectivity: alert.connectivity,
      }),
    });

    if (!res || !res.ok) {
      let body = null;
      try {
        body = res ? await res.json() : null;
      } catch {
        body = null;
      }
      return {
        ok: false,
        statusLabel: ALERT_STATUS.FAILED_NOT_SENT,
        providerResponse: body ? body.providerResponse || null : null,
        reason: body && body.message ? body.message : `backend HTTP ${res ? res.status : 'error'}`,
      };
    }

    const data = await res.json();
    const record = data && data.alert ? data.alert : null;
    return {
      ok: true,
      statusLabel: mapBackendStatus(record ? record.statusCode : data && data.statusCode),
      providerResponse: record ? record.providerResponse || null : null,
      reason: null,
    };
  } catch (err) {
    return {
      ok: false,
      statusLabel: ALERT_STATUS.FAILED_NOT_SENT,
      providerResponse: null,
      reason: err && err.message ? err.message : 'backend unreachable',
    };
  }
}

/** Flush the backend's offline queue. Never throws. */
export async function flushBackendQueue(backendUrl, fetchImpl = globalThis.fetch) {
  const base = trim(backendUrl);
  if (!base || typeof fetchImpl !== 'function') return { ok: false, flushed: 0, reason: 'backend not configured' };
  try {
    const res = await fetchImpl(`${base}/api/grid-alerts/flush`, { method: 'POST' });
    if (!res || !res.ok) return { ok: false, flushed: 0, reason: `backend HTTP ${res ? res.status : 'error'}` };
    const data = await res.json();
    return { ok: true, flushed: Number(data.flushed) || 0, reason: null };
  } catch (err) {
    return { ok: false, flushed: 0, reason: err && err.message ? err.message : 'backend unreachable' };
  }
}
