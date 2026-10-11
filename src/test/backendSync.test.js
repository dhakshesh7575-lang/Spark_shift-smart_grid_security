// Tests for the optional backend-sync helpers:
//   src/logic/backendSync.js  (fetchBackendAlerts)
//   src/logic/smsAlerts.js    (normaliseBackendAlert, mergeBackendAlerts)
import { describe, it, expect, vi } from 'vitest';
import { fetchBackendAlerts } from '../logic/backendSync';
import { normaliseBackendAlert, mergeBackendAlerts, ALERT_MODES } from '../logic/smsAlerts';

describe('fetchBackendAlerts', () => {
  it('does nothing (and does not throw) when no backend URL is configured', async () => {
    const fetchImpl = vi.fn();
    const res = await fetchBackendAlerts('', fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.alerts).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns alerts on success', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ mode: 'REAL_SMS', alerts: [{ eventId: 'E1' }] }),
    }));
    const res = await fetchBackendAlerts('http://localhost:3001/', fetchImpl);
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('REAL_SMS');
    expect(res.alerts).toHaveLength(1);
    // Trailing slash is trimmed.
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3001/api/alerts', expect.anything());
  });

  it('reports failure (never throws) on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const res = await fetchBackendAlerts('http://localhost:3001', fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/500/);
  });

  it('reports failure (never throws) when the backend is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connection refused');
    });
    const res = await fetchBackendAlerts('http://localhost:3001', fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/connection refused/);
  });
});

describe('normaliseBackendAlert / mergeBackendAlerts', () => {
  it('normalises a backend record into the dashboard shape', () => {
    const a = normaliseBackendAlert({
      eventId: 'E1',
      meterId: 'MTR-1',
      eventTime: 'T',
      reason: 'bad',
      mode: 'REAL_SMS',
      smsStatus: 'PROVIDER_ACCEPTED',
      smsStatusLabel: 'Provider accepted — Delivery not confirmed',
      providerResponse: { sid: 'x' },
      createdAt: '2026-01-01T00:00:00.000Z',
      at: 5,
    });
    expect(a.meterId).toBe('MTR-1');
    expect(a.mode).toBe(ALERT_MODES.REAL_SMS);
    expect(a.smsStatus).toBe('Provider accepted — Delivery not confirmed');
    expect(a.providerResponse).toEqual({ sid: 'x' });
    expect(a.meterKey).toBe('MTR-1');
  });

  it('rejects records without an event id', () => {
    expect(normaliseBackendAlert({ meterId: 'M' })).toBeNull();
    expect(normaliseBackendAlert(null)).toBeNull();
  });

  it('merges without duplicating existing event ids', () => {
    const existing = [{ eventId: 'E1', meterId: 'MTR-1', at: 10 }];
    const merged = mergeBackendAlerts(existing, [
      { eventId: 'E1', meterId: 'MTR-1' }, // dupe
      { eventId: 'E2', meterId: 'MTR-2', at: 20 },
    ]);
    expect(merged.added).toBe(1);
    expect(merged.history.map((a) => a.eventId)).toContain('E2');
    expect(merged.history.filter((a) => a.eventId === 'E1')).toHaveLength(1);
  });
});
