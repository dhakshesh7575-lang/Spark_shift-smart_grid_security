import { describe, it, expect } from 'vitest';
import { createSecurityEvent } from '../server/src/models/SecurityEvent.mjs';
import { parseAdminNumbers, isE164 } from '../server/src/utils/adminConfig.mjs';

describe('SecurityEvent model', () => {
  it('generates server-side incident ID', () => {
    const ev = createSecurityEvent({ eventType: 'ACCESS_REJECTION' });
    expect(ev.id).toBeTruthy();
    expect(ev.id).toMatch(/^INC-/);
    expect(ev.timestamp).toBeTruthy();
  });

  it('distinguishes event types', () => {
    const rej = createSecurityEvent({ eventType: 'ACCESS_REJECTION' });
    const theft = createSecurityEvent({ eventType: 'CONFIRMED_THEFT' });
    expect(rej.eventType).toBe('ACCESS_REJECTION');
    expect(theft.eventType).toBe('CONFIRMED_THEFT');
  });

  it('uses server-generated timestamps only', () => {
    const ev = createSecurityEvent({});
    expect(new Date(ev.timestamp).toISOString()).toBe(ev.timestamp);
  });
});

describe('SecurityEvent GSM fallback fields (lac / cell_id)', () => {
  it('defaults lac and cell_id to null when omitted', () => {
    const ev = createSecurityEvent({ eventType: 'ACCESS_REJECTION' });
    expect(ev.lac).toBeNull();
    expect(ev.cell_id).toBeNull();
  });

  it('accepts lac and cell_id values (number or string)', () => {
    const ev = createSecurityEvent({ lac: 4057, cell_id: '123456' });
    expect(ev.lac).toBe(4057);
    expect(ev.cell_id).toBe('123456');
  });

  it('rejects empty / blank strings by converting them to null', () => {
    const ev = createSecurityEvent({ lac: '', cell_id: '   ' });
    expect(ev.lac).toBeNull();
    expect(ev.cell_id).toBeNull();
  });

  it('trims surrounding whitespace from string values', () => {
    const ev = createSecurityEvent({ lac: '  4057 ', cell_id: ' 123456 ' });
    expect(ev.lac).toBe('4057');
    expect(ev.cell_id).toBe('123456');
  });

  it('never emits undefined for lac / cell_id', () => {
    const ev = createSecurityEvent({ lac: undefined, cell_id: undefined });
    expect(ev.lac).not.toBeUndefined();
    expect(ev.cell_id).not.toBeUndefined();
  });
});

describe('Admin config validation', () => {
  it('validates E.164 format', () => {
    expect(isE164('+919080337074')).toBe(true);
    expect(isE164('919080337074')).toBe(false);
    expect(isE164('+123')).toBe(true);
  });

  it('parses comma-separated numbers, dedupes, filters invalid', () => {
    const nums = parseAdminNumbers('+919080337074,+919047056070,invalid,+919080337074');
    expect(nums.length).toBe(2);
    expect(nums).toContain('+919080337074');
    expect(nums).toContain('+919047056070');
  });

  it('returns empty for missing/invalid', () => {
    expect(parseAdminNumbers('')).toEqual([]);
    expect(parseAdminNumbers(null)).toEqual([]);
    expect(parseAdminNumbers(undefined)).toEqual([]);
  });
});
