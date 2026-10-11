// Backend tests for GridAlertService (server/src/services/GridAlertService.mjs).
//
// Covers the required scenarios with an injected fetch + in-memory store:
//   1. DEMO mode            -> recorded as DEMO_NOT_SENT, NO network call
//   2. REAL_SMS, no creds   -> stays DEMO_NOT_SENT, NO network call
//   3. REAL_SMS + creds     -> provider called, mapped to SMS_REQUEST_ACCEPTED
//   4. provider failure     -> FAILED_NOT_SENT
//   5. offline reading      -> QUEUED_OFFLINE, then sent on flush()
//   6. duplicate alertId    -> DUPLICATE (no second provider call)
//   7. invalid payload      -> rejected by validation
import { describe, it, expect, vi } from 'vitest';
import {
  GRID_STATUS,
  buildTheftSms,
  createGridAlertService,
  providerStatusToGridStatus,
  validateGridAlert,
} from '../server/src/services/GridAlertService.mjs';
import { getSmsConfig } from '../server/src/utils/smsConfig.mjs';

/** In-memory store (file:null disables disk writes). */
function memStore() {
  let data = [];
  return {
    load: () => data,
    save: (records) => {
      data = records.slice();
      return true;
    },
    file: null,
  };
}

/** 2xx provider response. */
function okFetch(payload = { sid: 'SM123', status: 'queued' }) {
  return vi.fn(async () => ({
    ok: true,
    status: 201,
    text: async () => JSON.stringify(payload),
  }));
}

/** 500 provider response. */
function failFetch() {
  return vi.fn(async () => ({
    ok: false,
    status: 500,
    text: async () => JSON.stringify({ message: 'provider down' }),
  }));
}

const DEMO_CONFIG = getSmsConfig({ ALERT_MODE: 'SIMULATION', ADMIN_PHONE_NUMBER: '+910000000000' });
const REAL_NO_CREDS = getSmsConfig({ ALERT_MODE: 'REAL_SMS', ADMIN_PHONE_NUMBER: '+910000000000' });
const REAL_GENERIC = getSmsConfig({
  ALERT_MODE: 'REAL_SMS',
  ADMIN_PHONE_NUMBER: '+910000000000',
  SMS_PROVIDER: 'generic',
  SMS_PROVIDER_URL: 'https://sms.example.test/send',
  SMS_PROVIDER_API_KEY: 'test-key',
});
const REAL_TWILIO = getSmsConfig({
  ALERT_MODE: 'REAL_SMS',
  ADMIN_PHONE_NUMBER: '+910000000000',
  SMS_PROVIDER: 'twilio',
  TWILIO_ACCOUNT_SID: 'ACxxx',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_FROM_NUMBER: '+15000000000',
});

function makeService(config, fetchImpl = vi.fn(), now = () => 1000) {
  return createGridAlertService({ config, fetchImpl, now, store: memStore() });
}

const PAYLOAD = {
  alertId: 'GA-TEST-1',
  meterId: 'MTR-001',
  meterName: 'Block A Meter',
  location: 'Block A, Meter Box 1',
  reading: 8.75,
  reason: 'Suspected electricity theft',
  timestamp: '01/01/2026, 10:00:00',
  connectivity: 'ONLINE',
};

describe('GridAlertService — validation', () => {
  it('accepts a well-formed payload', () => {
    expect(validateGridAlert(PAYLOAD).ok).toBe(true);
  });

  it('rejects a missing meterId and a non-numeric reading', () => {
    const res = validateGridAlert({ reading: 'abc' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/meterId/);
    expect(res.errors.join(' ')).toMatch(/reading/);
  });
});

describe('GridAlertService — scenarios', () => {
  it('scenario 1: DEMO mode records DEMO_NOT_SENT and makes NO network call', async () => {
    const fetchImpl = vi.fn();
    const service = makeService(DEMO_CONFIG, fetchImpl);

    const res = await service.ingest(PAYLOAD);
    expect(res.accepted).toBe(true);
    expect(res.record.statusCode).toBe('DEMO_NOT_SENT');
    expect(res.record.status).toBe(GRID_STATUS.DEMO_NOT_SENT);
    expect(res.record.sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('scenario 2: REAL_SMS without credentials stays DEMO_NOT_SENT (no call)', async () => {
    const fetchImpl = vi.fn();
    const service = makeService(REAL_NO_CREDS, fetchImpl);

    const res = await service.ingest(PAYLOAD);
    expect(res.record.statusCode).toBe('DEMO_NOT_SENT');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('scenario 3: REAL_SMS + credentials calls the provider → SMS_REQUEST_ACCEPTED', async () => {
    const fetchImpl = okFetch();
    const service = makeService(REAL_GENERIC, fetchImpl);

    const res = await service.ingest(PAYLOAD);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.record.statusCode).toBe('SMS_REQUEST_ACCEPTED');
    expect(res.record.status).toBe(GRID_STATUS.SMS_REQUEST_ACCEPTED);
    expect(res.record.providerResponse).toEqual({ sid: 'SM123', status: 'queued' });

    // The recipient is always the configured admin number.
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.body).toContain('+910000000000');
  });

  it('scenario 4: provider failure → FAILED_NOT_SENT (never success)', async () => {
    const service = makeService(REAL_GENERIC, failFetch());
    const res = await service.ingest(PAYLOAD);
    expect(res.record.statusCode).toBe('FAILED_NOT_SENT');
    expect(res.record.status).toBe(GRID_STATUS.FAILED_NOT_SENT);
    expect(res.record.sent).toBe(false);
  });

  it('supports a Twilio-style provider (form POST, Basic auth)', async () => {
    const fetchImpl = okFetch();
    const service = makeService(REAL_TWILIO, fetchImpl);

    const res = await service.ingest({ ...PAYLOAD, alertId: 'GA-TW-1' });
    expect(res.record.statusCode).toBe('SMS_REQUEST_ACCEPTED');

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('api.twilio.com');
    expect(options.headers.Authorization).toMatch(/^Basic /);
    expect(options.body).toContain('To=%2B910000000000');
  });

  it('scenario 5: offline reading queues, then flush() delivers it', async () => {
    const fetchImpl = okFetch();
    const service = makeService(REAL_GENERIC, fetchImpl);

    const queued = await service.ingest({ ...PAYLOAD, alertId: 'GA-OFF-1', connectivity: 'OFFLINE' });
    expect(queued.record.statusCode).toBe('QUEUED_OFFLINE');
    expect(queued.record.queued).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(service.getState().queued).toBe(1);

    const fl = await service.flush();
    expect(fl.flushed).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const record = service.list().find((r) => r.alertId === 'GA-OFF-1');
    expect(record.statusCode).toBe('SMS_REQUEST_ACCEPTED');
    expect(record.queued).toBe(false);
  });

  it('scenario 6: a duplicate alertId is rejected without a second send', async () => {
    const fetchImpl = okFetch();
    const service = makeService(REAL_GENERIC, fetchImpl);

    const first = await service.ingest(PAYLOAD);
    const second = await service.ingest(PAYLOAD);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.outcome).toBe('DUPLICATE');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('scenario 7: an invalid payload is rejected by validation', async () => {
    const fetchImpl = vi.fn();
    const service = makeService(REAL_GENERIC, fetchImpl);
    const res = await service.ingest({ meterId: '', reading: 8.75 });
    expect(res.accepted).toBe(false);
    expect(res.outcome).toBe('INVALID');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('GridAlertService — HTTP + history', () => {
  it('handleHttpRequest validates and returns 400 on bad input', async () => {
    const service = makeService(DEMO_CONFIG, vi.fn());
    const res = await service.handleHttpRequest({ headers: {}, body: { reading: 'x' }, clientKey: 'ip' });
    expect(res.httpStatus).toBe(400);
  });

  it('acknowledge removes an alert from the active queue', async () => {
    const service = makeService(DEMO_CONFIG, vi.fn());
    await service.ingest({ ...PAYLOAD, alertId: 'GA-ACK-1', connectivity: 'OFFLINE' });
    const res = service.acknowledge('GA-ACK-1');
    expect(res.ok).toBe(true);
    expect(res.record.acknowledged).toBe(true);
    expect(res.record.queued).toBe(false);
  });

  it('exposes a capability summary without leaking the phone number', () => {
    const service = makeService(REAL_TWILIO, vi.fn());
    const state = service.getState();
    expect(state.realSmsEnabled).toBe(true);
    expect(state.provider).toBe('twilio');
    expect(JSON.stringify(state)).not.toContain('+910000000000');
    expect(state.adminNumberMasked).toMatch(/••••/);
  });
});

describe('GridAlertService — message + status helpers', () => {
  it('builds the exact required SMS body', () => {
    expect(
      buildTheftSms({
        meterId: 'MTR-001',
        meterName: 'Block A Meter',
        location: 'Block A, Meter Box 1',
        reading: 8.75,
        timestamp: 'ts',
      })
    ).toContain('Reading: 8.75 (SIMULATED)');
  });

  it('maps provider statuses truthfully (never DELIVERED)', () => {
    expect(providerStatusToGridStatus('PROVIDER_ACCEPTED')).toBe('SMS_REQUEST_ACCEPTED');
    expect(providerStatusToGridStatus('FAILED')).toBe('FAILED_NOT_SENT');
    expect(providerStatusToGridStatus('SIMULATED')).toBe('DEMO_NOT_SENT');
  });
});
