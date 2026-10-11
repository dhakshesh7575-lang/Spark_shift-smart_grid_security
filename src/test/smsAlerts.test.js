// Unit tests for the front-end SMS alert model (src/logic/smsAlerts.js).
// These run with zero backend / zero credentials — the default simulation path.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALERT_MODES,
  SMS_STATUS,
  DEFAULT_COOLDOWN_SECONDS,
  MAX_HISTORY,
  STORAGE_KEY,
  SIMULATION_NOTICE,
  buildAlertMessage,
  createSmsAlert,
  appendAlert,
  findDuplicate,
  makeEventId,
  maskPhone,
  isPresent,
  statusLabel,
  buildSmsReport,
  loadAlertHistory,
  saveAlertHistory,
  clearAlertHistory,
} from '../logic/smsAlerts';

/** Minimal in-memory Storage stand-in for deterministic tests. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() {
      return map.size;
    },
  };
}

describe('smsAlerts: message building', () => {
  it('uses the real project values and never prints "undefined"', () => {
    const msg = buildAlertMessage({
      meterId: 'MTR-0451',
      eventTime: '2026-01-02 10:30:00',
      reason: 'checksum mismatch',
    });
    expect(msg).toContain('ELECTRICITY THEFT ALERT!');
    expect(msg).toContain('Unauthorised meter access detected.');
    expect(msg).toContain('Meter ID: MTR-0451');
    expect(msg).toContain('Event: Chip Authentication Failed');
    expect(msg).toContain('Date/Time: 2026-01-02 10:30:00');
    expect(msg).toContain('Reason: checksum mismatch');
    expect(msg).toContain('Please verify the meter immediately.');
    expect(msg).not.toContain('undefined');
  });

  it('falls back safely when values are missing', () => {
    const msg = buildAlertMessage({});
    expect(msg).toContain('Meter ID: UNKNOWN');
    expect(msg).toContain('Date/Time: Unavailable');
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('Reason:'); // no reason line when absent
  });

  it('labels a test alert explicitly', () => {
    const msg = buildAlertMessage({ meterId: 'MTR-TEST-001', test: true });
    expect(msg).toContain('[TEST ALERT');
  });
});

describe('smsAlerts: event creation', () => {
  it('creates a SIMULATED alert by default (never claims it was sent)', () => {
    const a = createSmsAlert({ meterId: 'MTR-001', reason: 'bad checksum', now: 1_700_000_000_000 });
    expect(a.mode).toBe(ALERT_MODES.SIMULATION);
    expect(a.smsStatus).toBe(SMS_STATUS.SIMULATED);
    expect(a.smsStatus).toBe('Simulated — Not sent');
    expect(a.authStatus).toBe('FAILED');
    expect(a.eventId).toMatch(/^ALERT-[0-9A-F]{8}$/);
  });

  it('starts REAL_SMS alerts as Pending (delivery is never assumed)', () => {
    const a = createSmsAlert({ meterId: 'MTR-001', mode: ALERT_MODES.REAL_SMS, now: 1 });
    expect(a.smsStatus).toBe(SMS_STATUS.PENDING);
    expect(a.simulated).toBe(false);
  });

  it('falls back to UNKNOWN for a missing meter id', () => {
    const a = createSmsAlert({ reason: 'x', now: 1 });
    expect(a.meterId).toBe('UNKNOWN');
  });

  it('produces a deterministic event id for identical incident data', () => {
    const id1 = makeEventId('MTR-1', 'CODE', 123);
    const id2 = makeEventId('MTR-1', 'CODE', 123);
    const id3 = makeEventId('MTR-1', 'CODE', 124);
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });
});

describe('smsAlerts: duplicate suppression', () => {
  it('suppresses the exact same event id', () => {
    const a = createSmsAlert({ meterId: 'MTR-1', code: 'C', now: 1000 });
    let out = appendAlert([], a);
    expect(out.added).toBe(true);

    // Same event replayed.
    out = appendAlert(out.history, { ...a });
    expect(out.added).toBe(false);
    expect(out.duplicate).toBe(true);
    expect(out.reason).toMatch(/duplicate event id/);
    expect(out.history).toHaveLength(1);
  });

  it('suppresses repeats for the same meter inside the cooldown', () => {
    const first = createSmsAlert({ meterId: 'MTR-1', code: 'A', now: 1000 });
    const second = createSmsAlert({ meterId: 'MTR-1', code: 'B', now: 1000 + 5_000 });
    const out = appendAlert([first], second);
    expect(out.added).toBe(false);
    expect(out.reason).toMatch(/cooldown active/);
  });

  it('allows a genuinely separate incident after the cooldown', () => {
    const first = createSmsAlert({ meterId: 'MTR-1', code: 'A', now: 1000 });
    const later = createSmsAlert({
      meterId: 'MTR-1',
      code: 'B',
      now: 1000 + DEFAULT_COOLDOWN_SECONDS * 1000 + 1,
    });
    const out = appendAlert([first], later);
    expect(out.added).toBe(true);
    expect(out.history).toHaveLength(2);
  });

  it('does not treat different meters as duplicates', () => {
    const a = createSmsAlert({ meterId: 'MTR-1', code: 'A', now: 1000 });
    const b = createSmsAlert({ meterId: 'MTR-2', code: 'B', now: 1500 });
    expect(findDuplicate([a], b)).toBeNull();
    expect(appendAlert([a], b).added).toBe(true);
  });

  it('lets TEST alerts bypass suppression', () => {
    const t1 = createSmsAlert({ meterId: 'MTR-TEST-001', test: true, now: 1000 });
    const t2 = createSmsAlert({ meterId: 'MTR-TEST-001', test: true, now: 1100 });
    let out = appendAlert([], t1);
    out = appendAlert(out.history, t2);
    expect(out.added).toBe(true);
    expect(out.history).toHaveLength(2);
  });

  it('caps history at MAX_HISTORY', () => {
    let history = [];
    for (let i = 0; i < MAX_HISTORY + 10; i += 1) {
      const a = createSmsAlert({ meterId: `MTR-${i}`, now: i * 1000 });
      history = appendAlert(history, a).history;
    }
    expect(history).toHaveLength(MAX_HISTORY);
  });
});

describe('smsAlerts: display helpers', () => {
  it('masks the admin number (never shows it in full)', () => {
    expect(maskPhone('+919876543210')).toBe('••••3210');
    expect(maskPhone('')).toBe('not configured');
    expect(maskPhone('12')).toBe('••••');
  });

  it('isPresent treats blank / "Unavailable" as absent', () => {
    expect(isPresent('  ')).toBe(false);
    expect(isPresent('Unavailable')).toBe(false);
    expect(isPresent('MTR-1')).toBe(true);
    expect(isPresent(null)).toBe(false);
  });

  it('maps unknown status codes to Failed (never over-claims)', () => {
    expect(statusLabel('SIMULATED')).toBe(SMS_STATUS.SIMULATED);
    expect(statusLabel('nonsense')).toBe(SMS_STATUS.FAILED);
  });

  it('builds a shareable report from real values only', () => {
    const a = createSmsAlert({ meterId: 'MTR-9', reason: 'r', now: 1 });
    const report = buildSmsReport(a);
    expect(report).toContain('Meter ID: MTR-9');
    expect(report).toContain(`Event ID: ${a.eventId}`);
    expect(report).toContain('SMS status: Simulated — Not sent');
  });

  it('exposes the required simulation notice text', () => {
    expect(SIMULATION_NOTICE).toBe('SIMULATED SMS — Not actually sent.');
  });
});

describe('smsAlerts: persistence', () => {
  let storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('round-trips history through storage', () => {
    const a = createSmsAlert({ meterId: 'MTR-1', now: 1 });
    saveAlertHistory([a], storage);
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy();
    const loaded = loadAlertHistory(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].meterId).toBe('MTR-1');
  });

  it('returns [] for corrupt or absent storage', () => {
    expect(loadAlertHistory(storage)).toEqual([]);
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadAlertHistory(storage)).toEqual([]);
    storage.setItem(STORAGE_KEY, JSON.stringify({ not: 'array' }));
    expect(loadAlertHistory(storage)).toEqual([]);
  });

  it('clears stored history', () => {
    saveAlertHistory([createSmsAlert({ meterId: 'MTR-1', now: 1 })], storage);
    clearAlertHistory(storage);
    expect(loadAlertHistory(storage)).toEqual([]);
  });

  it('never throws when storage is unavailable', () => {
    const broken = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
      removeItem() {
        throw new Error('denied');
      },
    };
    expect(() => saveAlertHistory([], broken)).not.toThrow();
    expect(loadAlertHistory(broken)).toEqual([]);
    expect(() => clearAlertHistory(broken)).not.toThrow();
  });
});
