// The seven required test scenarios from the task specification, mapped onto
// the backend services. These are the "proof" tests for the feature.
//
//   1. Authorised chip           -> no alert
//   2. Unauthorised chip         -> simulated SMS produced
//   3. Duplicate event           -> duplicate alert prevented
//   4. Backend unavailable       -> clear error, no false success
//   5. SMS credentials missing   -> simulation still works
//   6. Real SMS mode disabled    -> no external request made
//   7. Real SMS + free credits   -> attempt recorded with provider response
import { describe, it, expect, vi } from 'vitest';
import { createSmsAlertService } from '../server/src/services/SmsAlertService.mjs';
import { sendSms, PROVIDER_STATUS } from '../server/src/services/SmsProvider.mjs';
import { getSmsConfig } from '../server/src/utils/smsConfig.mjs';

const AUTH_HEADERS = { 'x-device-id': 'esp32-1', 'x-device-token': 'tok-secret' };

function build(envOverrides = {}, { fetchImpl, clock = { t: 1000 } } = {}) {
  const config = getSmsConfig({
    DEVICE_ID: 'esp32-1',
    DEVICE_TOKEN: 'tok-secret',
    ...envOverrides,
  });
  return createSmsAlertService({ config, fetchImpl: fetchImpl || vi.fn(), now: () => clock.t });
}

describe('SMS alert scenarios (spec Step 7)', () => {
  it('1. authorised chip — no alert is generated', async () => {
    const service = build({ ALERT_MODE: 'SIMULATION' });
    const res = await service.handleDeviceRequest({
      headers: AUTH_HEADERS,
      body: { meterId: 'MTR-001', status: 'VERIFIED' },
    });
    expect(res.body.status).toBe('no_alert');
    expect(service.getHistory()).toHaveLength(0);
  });

  it('2. unauthorised chip — simulated SMS is produced and queued', async () => {
    const service = build({ ALERT_MODE: 'SIMULATION', ADMIN_PHONE_NUMBER: '+911234567890' });
    const res = await service.handleDeviceRequest({
      headers: AUTH_HEADERS,
      body: { meterId: 'MTR-001', status: 'FAILED', reason: 'checksum mismatch' },
    });
    expect(res.body.status).toBe('accepted');
    expect(res.body.record.smsStatus).toBe('SIMULATED');
    expect(service.getHistory()).toHaveLength(1);
  });

  it('3. duplicate event — the second report is suppressed', async () => {
    const service = build({ ALERT_MODE: 'SIMULATION' });
    const payload = { meterId: 'MTR-001', status: 'FAILED', eventId: 'INC-42' };
    const first = await service.handleDeviceRequest({ headers: AUTH_HEADERS, body: payload });
    const second = await service.handleDeviceRequest({ headers: AUTH_HEADERS, body: payload });
    expect(first.body.status).toBe('accepted');
    expect(second.body.status).toBe('duplicate');
    expect(service.getHistory()).toHaveLength(1);
  });

  it('4. backend/provider unavailable — clear error and NO false success', async () => {
    const service = build(
      {
        ALERT_MODE: 'REAL_SMS',
        ADMIN_PHONE_NUMBER: '+911234567890',
        SMS_PROVIDER_URL: 'https://provider.example/send',
        SMS_PROVIDER_API_KEY: 'key',
      },
      {
        fetchImpl: vi.fn(async () => {
          throw new Error('backend unreachable');
        }),
      }
    );
    const res = await service.handleDeviceRequest({
      headers: AUTH_HEADERS,
      body: { meterId: 'MTR-001', status: 'FAILED' },
    });
    expect(res.body.record.smsStatus).toBe('FAILED');
    expect(res.body.record.sent).toBe(false);
    expect(res.body.record.detail).toMatch(/unreachable|failed/i);
  });

  it('5. SMS credentials missing — simulation continues to work', async () => {
    const fetchImpl = vi.fn();
    const service = build({ ALERT_MODE: 'REAL_SMS' }, { fetchImpl }); // mode set, creds absent
    const res = await service.handleDeviceRequest({
      headers: AUTH_HEADERS,
      body: { meterId: 'MTR-001', status: 'FAILED' },
    });
    expect(res.body.status).toBe('accepted');
    expect(res.body.record.smsStatus).toBe('SIMULATED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('6. real SMS mode disabled — no external request is made', async () => {
    const fetchImpl = vi.fn();
    const out = await sendSms({ to: '+91', message: 'x' }, { mode: 'SIMULATION' }, fetchImpl);
    expect(out.status).toBe(PROVIDER_STATUS.SIMULATED);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('7. real SMS enabled with (free) credits — delivery is attempted and the provider response recorded', async () => {
    const providerResponse = { sid: 'SM123', status: 'queued', credits_remaining: 47 };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 201,
      text: async () => JSON.stringify(providerResponse),
    }));
    const service = build(
      {
        ALERT_MODE: 'REAL_SMS',
        ADMIN_PHONE_NUMBER: '+911234567890',
        SMS_PROVIDER_URL: 'https://provider.example/send',
        SMS_PROVIDER_API_KEY: 'key',
      },
      { fetchImpl }
    );
    const res = await service.handleDeviceRequest({
      headers: AUTH_HEADERS,
      body: { meterId: 'MTR-001', status: 'FAILED' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.body.record.smsStatus).toBe('PROVIDER_ACCEPTED');
    expect(res.body.record.providerResponse).toEqual(providerResponse);
    // Honest label: accepted is NOT delivered.
    expect(res.body.record.smsStatusLabel).toMatch(/not confirmed/i);
  });
});
