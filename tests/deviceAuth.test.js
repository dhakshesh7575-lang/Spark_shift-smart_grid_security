// Backend tests for server/src/services/DeviceAuth.mjs
import { describe, it, expect } from 'vitest';
import { checkDeviceAuth } from '../server/src/services/DeviceAuth.mjs';

const config = { deviceId: 'esp32-1', deviceToken: 'tok-secret' };

describe('DeviceAuth', () => {
  it('rejects when device auth is not configured', () => {
    const res = checkDeviceAuth({ 'x-device-id': 'esp32-1', 'x-device-token': 'tok-secret' }, {});
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not configured/);
  });

  it('rejects when credentials are missing', () => {
    expect(checkDeviceAuth({}, config).ok).toBe(false);
    expect(checkDeviceAuth({ 'x-device-id': 'esp32-1' }, config).ok).toBe(false);
    expect(checkDeviceAuth({}, config).reason).toMatch(/missing/);
  });

  it('rejects wrong credentials', () => {
    const res = checkDeviceAuth({ 'x-device-id': 'esp32-1', 'x-device-token': 'wrong' }, config);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/invalid/);
  });

  it('accepts correct credentials (case-insensitive headers)', () => {
    const res = checkDeviceAuth({ 'X-Device-Id': 'esp32-1', 'X-Device-Token': 'tok-secret' }, config);
    expect(res.ok).toBe(true);
    expect(res.reason).toBeNull();
  });
});
