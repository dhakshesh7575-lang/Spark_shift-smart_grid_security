// Backend tests for server/src/services/SmsAlertService.mjs
import { describe, it, expect, vi } from 'vitest';
import {
  createSmsAlertService,
  buildAlertMessage,
  makeEventId,
  SMS_STATUS_LABELS,
} from '../server/src/services/SmsAlertService.mjs';
import { getSmsConfig } from '../server/src/utils/smsConfig.mjs';

/** Build a service with a controllable clock and a spy fetch. */
function makeService(envOverrides = {}, { fetchImpl, clock = { t: 1000 } } = {}) {
  const config = getSmsConfig({
    ALERT_MODE: 'SIMULATION',
    DEVICE_ID: 'esp32-1',
    DEVICE_TOKEN: 'tok-secret',
    ALERT_COOLDOWN_SECONDS: '60',
    ALERT_RATE_LIMIT_PER_MINUTE: '10',
    ...envOverrides,
  });
  const service = createSmsAlertService({
    config,
    fetchImpl: fetchImpl || vi.fn(),
    now: () => clock.t,
  });
  return { service, config, clock };
}

describe('SmsAlertService: message + ids', () => {
  it('builds the alert body from real values (no "undefined")', () => {
    const msg = buildAlertMessage({ meterId: 'MTR-7', eventTime: 'T', reason: 'bad checksum' });
    expect(msg).toContain('Meter ID: MTR-7');
    expect(msg).toContain('Event: Chip Authentication Failed');
    expect(msg).toContain('Reason: bad checksum');
    expect(msg).not.toContain('undefined');
  });

  it('exports honest status labels', () => {
    expect(SMS_STATUS_LABELS.SIMULATED).toBe('Simulated — Not sent');
    expect(SMS_STATUS_LABELS.PROVIDER_ACCEPTED).toBe('Provider accepted — Delivery not confirmed');
  });

  it('makeEventId is deterministic per incident', () => {
    expect(makeEventId('M', 'C', 5)).toBe(makeEventId('M', 'C', 5));
    expect(makeEventId('M', 'C', 5)).not.toBe(makeEventId('M', 'C', 6));
  });
});

describe('SmsAlertService: ingest rules', () => {
  it('generates NO alert for a VERIFIED result', async () => {
    const fetchImpl = vi.fn();
    const { service } = makeService({}, { fetchImpl });
    const res = await service.ingest({ meterId: 'MTR-1', status: 'VERIFIED' });
    expect(res.alerted).toBe(false);
    expect(res.outcome).toBe('NO_ALERT');
    expect(service.getHistory()).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('generates a SIMULATED alert for a FAILED result (default mode)', async () => {
    const fetchImpl = vi.fn();
    const { service } = makeService({}, { fetchImpl });
    const res = await service.ingest({ meterId: 'MTR-1', status: 'FAILED', reason: 'bad checksum' });
    expect(res.alerted).toBe(true);
    expect(res.record.smsStatus).toBe('SIMULATED');
    expect(res.record.smsStatusLabel).toBe('Simulated — Not sent');
    expect(res.record.sent).toBe(false);
    expect(service.getHistory()).toHaveLength(1);
    expect(fetchImpl).not.toHaveBeenCalled(); // simulation never calls out
  });

  it('treats a missing status as a failure (defensive) but records the meter', async () => {
    const { service } = makeService();
    const res = await service.ingest({ meterId: 'MTR-9', code: 'X' });
    expect(res.alerted).toBe(true);
    expect(res.record.meterId).toBe('MTR-9');
  });

  it('suppresses a duplicate event id', async () => {
    const { service } = makeService();
    await service.ingest({ meterId: 'MTR-1', status: 'FAILED', eventId: 'E1' });
    const dup = await service.ingest({ meterId: 'MTR-1', status: 'FAILED', eventId: 'E1' });
    expect(dup.alerted).toBe(false);
    expect(dup.outcome).toBe('DUPLICATE');
    expect(service.getHistory()).toHaveLength(1);
  });

  it('suppresses repeats for the same meter inside the cooldown', async () => {
    const clock = { t: 1000 };
    const { service } = makeService({ ALERT_COOLDOWN_SECONDS: '60' }, { clock });
    await service.ingest({ meterId: 'MTR-1', status: 'FAILED' });
    clock.t = 1000 + 5_000;
    const dup = await service.ingest({ meterId: 'MTR-1', status: 'FAILED' });
    expect(dup.outcome).toBe('DUPLICATE');
    expect(service.getHistory()).toHaveLength(1);
  });

  it('allows a separate incident after the cooldown', async () => {
    const clock = { t: 1000 };
    const { service } = makeService({ ALERT_COOLDOWN_SECONDS: '60' }, { clock });
    await service.ingest({ meterId: 'MTR-1', status: 'FAILED' });
    clock.t = 1000 + 61_000;
    const res = await service.ingest({ meterId: 'MTR-1', status: 'FAILED' });
    expect(res.alerted).toBe(true);
    expect(service.getHistory()).toHaveLength(2);
  });
});

describe('SmsAlertService: HTTP handling', () => {
  const headers = { 'x-device-id': 'esp32-1', 'x-device-token': 'tok-secret' };

  it('rejects unauthenticated requests (401) and sends nothing', async () => {
    const fetchImpl = vi.fn();
    const { service } = makeService({}, { fetchImpl });
    const res = await service.handleDeviceRequest({ headers: {}, body: { meterId: 'MTR-1' } });
    expect(res.httpStatus).toBe(401);
    expect(service.getHistory()).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a body without meterId or code (400)', async () => {
    const { service } = makeService();
    const res = await service.handleDeviceRequest({ headers, body: { reason: 'x' } });
    expect(res.httpStatus).toBe(400);
  });

  it('accepts an authenticated FAILED report (200) and records it', async () => {
    const { service } = makeService();
    const res = await service.handleDeviceRequest({
      headers,
      body: { meterId: 'MTR-1', status: 'FAILED', reason: 'bad checksum' },
    });
    expect(res.httpStatus).toBe(200);
    expect(res.body.status).toBe('accepted');
    expect(service.getHistory()).toHaveLength(1);
  });

  it('returns no_alert for an authenticated VERIFIED report', async () => {
    const { service } = makeService();
    const res = await service.handleDeviceRequest({
      headers,
      body: { meterId: 'MTR-1', status: 'VERIFIED' },
    });
    expect(res.httpStatus).toBe(200);
    expect(res.body.status).toBe('no_alert');
    expect(service.getHistory()).toHaveLength(0);
  });

  it('rate limits a flood of alerts (429)', async () => {
    const { service } = makeService({ ALERT_RATE_LIMIT_PER_MINUTE: '2' });
    const ok1 = await service.handleDeviceRequest({ headers, body: { meterId: 'M1', status: 'FAILED' } });
    const ok2 = await service.handleDeviceRequest({ headers, body: { meterId: 'M2', status: 'FAILED' } });
    const blocked = await service.handleDeviceRequest({ headers, body: { meterId: 'M3', status: 'FAILED' } });
    expect(ok1.httpStatus).toBe(200);
    expect(ok2.httpStatus).toBe(200);
    expect(blocked.httpStatus).toBe(429);
  });

  it('creates a labelled test alert', async () => {
    const { service } = makeService();
    const res = await service.sendTestAlert();
    expect(res.alerted).toBe(true);
    expect(res.record.message).toContain('[TEST ALERT');
    expect(res.record.meterId).toBe('MTR-TEST-001');
  });

  it('reports state honestly', async () => {
    const { service } = makeService();
    const state = service.getState();
    expect(state.mode).toBe('SIMULATION');
    expect(state.realSmsEnabled).toBe(false);
  });
});
