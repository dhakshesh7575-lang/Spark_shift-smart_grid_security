// Backend tests for server/src/utils/smsConfig.mjs
// Simulation must be the safe default; REAL_SMS only when fully configured.
import { describe, it, expect } from 'vitest';
import {
  getSmsConfig,
  isRealSmsEnabled,
  normaliseAlertMode,
  realSmsDisabledReason,
  maskPhone,
} from '../server/src/utils/smsConfig.mjs';

describe('smsConfig', () => {
  it('defaults to SIMULATION with no credentials', () => {
    const c = getSmsConfig({});
    expect(c.mode).toBe('SIMULATION');
    expect(isRealSmsEnabled(c)).toBe(false);
  });

  it('only accepts REAL_SMS as an explicit mode value', () => {
    expect(normaliseAlertMode('real_sms')).toBe('REAL_SMS');
    expect(normaliseAlertMode('REAL_SMS')).toBe('REAL_SMS');
    expect(normaliseAlertMode('')).toBe('SIMULATION');
    expect(normaliseAlertMode('anything-else')).toBe('SIMULATION');
  });

  it('keeps REAL_SMS DISABLED when credentials are missing', () => {
    const c = getSmsConfig({ ALERT_MODE: 'REAL_SMS', ADMIN_PHONE_NUMBER: '+911234567890' });
    expect(c.mode).toBe('REAL_SMS');
    expect(isRealSmsEnabled(c)).toBe(false);
    expect(realSmsDisabledReason(c)).toMatch(/SMS_PROVIDER_URL/);
  });

  it('enables REAL_SMS only with mode + number + url + key', () => {
    const c = getSmsConfig({
      ALERT_MODE: 'REAL_SMS',
      ADMIN_PHONE_NUMBER: '+911234567890',
      SMS_PROVIDER_URL: 'https://provider.example/send',
      SMS_PROVIDER_API_KEY: 'secret',
    });
    expect(isRealSmsEnabled(c)).toBe(true);
    expect(realSmsDisabledReason(c)).toBeNull();
  });

  it('parses numeric limits with sane fallbacks', () => {
    expect(getSmsConfig({ ALERT_COOLDOWN_SECONDS: '30' }).cooldownSeconds).toBe(30);
    expect(getSmsConfig({ ALERT_COOLDOWN_SECONDS: 'nope' }).cooldownSeconds).toBe(60);
    expect(getSmsConfig({ ALERT_RATE_LIMIT_PER_MINUTE: '5' }).rateLimitPerMinute).toBe(5);
    expect(getSmsConfig({}).port).toBe(3001);
    expect(getSmsConfig({ SMS_PORT: '4100' }).port).toBe(4100);
  });

  it('masks phone numbers for display', () => {
    expect(maskPhone('+911234567890')).toBe('••••7890');
    expect(maskPhone('')).toBe('not configured');
    expect(maskPhone('12')).toBe('••••');
  });
});
