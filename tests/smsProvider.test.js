// Backend tests for server/src/services/SmsProvider.mjs
// The provider call must NEVER happen unless REAL_SMS is fully configured,
// and a test must never be able to make a real outbound request.
import { describe, it, expect, vi } from 'vitest';
import { sendSms, PROVIDER_STATUS } from '../server/src/services/SmsProvider.mjs';

function okResponse(body) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

describe('SmsProvider', () => {
  it('SIMULATES and makes no network call in simulation mode', async () => {
    const fetchImpl = vi.fn();
    const out = await sendSms({ to: '+91', message: 'hi' }, { mode: 'SIMULATION' }, fetchImpl);
    expect(out.status).toBe(PROVIDER_STATUS.SIMULATED);
    expect(out.sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('makes no network call when REAL_SMS credentials are incomplete', async () => {
    const fetchImpl = vi.fn();
    const out = await sendSms(
      { to: '+91', message: 'hi' },
      { mode: 'REAL_SMS', adminPhone: '+91' },
      fetchImpl
    );
    expect(out.status).toBe(PROVIDER_STATUS.SIMULATED);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('records the provider response when REAL_SMS is fully configured', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ id: 'msg-123', status: 'queued' }));
    const config = {
      mode: 'REAL_SMS',
      adminPhone: '+911234567890',
      providerUrl: 'https://provider.example/send',
      providerApiKey: 'key',
      senderId: 'EBADMIN',
    };
    const out = await sendSms({ to: config.adminPhone, message: 'alert' }, config, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out.status).toBe(PROVIDER_STATUS.PROVIDER_ACCEPTED);
    expect(out.sent).toBe(true);
    expect(out.providerResponse).toEqual({ id: 'msg-123', status: 'queued' });
    // Never over-claims delivery.
    expect(out.detail).toMatch(/not confirmed/i);
  });

  it('reports FAILED (never success) on a non-2xx provider response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 402,
      text: async () => JSON.stringify({ error: 'insufficient credits' }),
    }));
    const config = {
      mode: 'REAL_SMS',
      adminPhone: '+911234567890',
      providerUrl: 'https://provider.example/send',
      providerApiKey: 'key',
    };
    const out = await sendSms({ to: config.adminPhone, message: 'alert' }, config, fetchImpl);
    expect(out.status).toBe(PROVIDER_STATUS.FAILED);
    expect(out.sent).toBe(false);
    expect(out.providerResponse).toEqual({ error: 'insufficient credits' });
  });

  it('reports FAILED (never success) when the provider throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const config = {
      mode: 'REAL_SMS',
      adminPhone: '+911234567890',
      providerUrl: 'https://provider.example/send',
      providerApiKey: 'key',
    };
    const out = await sendSms({ to: config.adminPhone, message: 'alert' }, config, fetchImpl);
    expect(out.status).toBe(PROVIDER_STATUS.FAILED);
    expect(out.sent).toBe(false);
    expect(out.detail).toMatch(/network down/);
  });
});
