// Tests for the optional grid-alert backend client (src/logic/gridAlertsApi.js).
// A fake fetch is injected, so this needs no network and no credentials.
import { describe, it, expect, vi } from 'vitest';
import {
  flushBackendQueue,
  mapBackendStatus,
  postGridAlert,
} from '../src/logic/gridAlertsApi';
import { ALERT_STATUS } from '../src/logic/gridDemo';

const ALERT = {
  alertId: 'GA-1',
  meterId: 'MTR-001',
  meterName: 'Block A Meter',
  location: 'Block A, Meter Box 1',
  reading: 8.75,
  reason: 'Suspected electricity theft',
  timestamp: 'ts',
  connectivity: 'ONLINE',
};

/** Build a minimal Response-like object. */
function fakeResponse({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: async () => json };
}

describe('gridAlertsApi — status mapping', () => {
  it('maps backend codes to truthful dashboard labels', () => {
    expect(mapBackendStatus('DEMO_NOT_SENT')).toBe(ALERT_STATUS.DEMO_NOT_SENT);
    expect(mapBackendStatus('SMS_REQUEST_ACCEPTED')).toBe(ALERT_STATUS.SMS_REQUEST_ACCEPTED);
    expect(mapBackendStatus('FAILED_NOT_SENT')).toBe(ALERT_STATUS.FAILED_NOT_SENT);
    expect(mapBackendStatus('QUEUED_OFFLINE')).toBe(ALERT_STATUS.QUEUED_OFFLINE);
    // Unknown codes fall back to an honest failure (never "delivered").
    expect(mapBackendStatus('DELIVERED')).toBe(ALERT_STATUS.FAILED_NOT_SENT);
  });
});

describe('gridAlertsApi — postGridAlert', () => {
  it('returns the mapped status and provider response on success', async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({
        json: {
          status: 'accepted',
          alert: { statusCode: 'SMS_REQUEST_ACCEPTED', providerResponse: { sid: 'SM123' } },
        },
      })
    );

    const res = await postGridAlert('http://localhost:3001/', ALERT, fetchImpl);
    expect(res.ok).toBe(true);
    expect(res.statusLabel).toBe(ALERT_STATUS.SMS_REQUEST_ACCEPTED);
    expect(res.providerResponse).toEqual({ sid: 'SM123' });
    // The recipient is chosen by the backend, never sent by the browser.
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.body).not.toMatch(/\+?\d{7,}/);
  });

  it('reports a failure (never success) when the backend errors', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ ok: false, status: 500, json: { message: 'boom' } }));
    const res = await postGridAlert('http://localhost:3001', ALERT, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.statusLabel).toBe(ALERT_STATUS.FAILED_NOT_SENT);
  });

  it('reports a failure when the backend is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const res = await postGridAlert('http://localhost:3001', ALERT, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.statusLabel).toBe(ALERT_STATUS.FAILED_NOT_SENT);
    expect(res.reason).toMatch(/ECONNREFUSED/);
  });

  it('does not attempt a request when no backend URL is configured', async () => {
    const fetchImpl = vi.fn();
    const res = await postGridAlert('', ALERT, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
  });
});

describe('gridAlertsApi — flushBackendQueue', () => {
  it('returns the flushed count', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ json: { flushed: 3 } }));
    const res = await flushBackendQueue('http://localhost:3001', fetchImpl);
    expect(res.ok).toBe(true);
    expect(res.flushed).toBe(3);
  });

  it('never throws when the backend is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    });
    const res = await flushBackendQueue('http://localhost:3001', fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.flushed).toBe(0);
  });
});
