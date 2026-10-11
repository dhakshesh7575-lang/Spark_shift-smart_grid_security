// Unit tests for the Smart Grid Security DEMO domain model
// (src/logic/gridDemo.js). No backend, no network, no credentials.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALERT_STATUS,
  CONNECTIVITY,
  DEMO_METERS,
  SMS_CHANNEL,
  THEFT_THRESHOLD_KW,
  acknowledgeGridAlert,
  appendGridAlert,
  buildTheftSms,
  clearGridAlerts,
  createGridAlert,
  findMeter,
  formatReading,
  generateNormalReading,
  generateTheftReading,
  isTheftReading,
  loadGridAlerts,
  queuedGridAlerts,
  saveGridAlerts,
} from '../src/logic/gridDemo';

/** Simple in-memory storage stand-in for localStorage. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const METER = DEMO_METERS[0];

describe('gridDemo — SMS message format', () => {
  it('renders the exact required theft-alert format with real values', () => {
    const message = buildTheftSms({
      meterId: 'MTR-001',
      meterName: 'Block A Meter',
      location: 'Block A, Meter Box 1',
      reading: 8.75,
      timestamp: '01/01/2026, 10:00:00',
    });

    expect(message).toBe(
      [
        'ALERT: Suspected electricity theft.',
        'Meter ID: MTR-001',
        'Meter name: Block A Meter',
        'Location: Block A, Meter Box 1',
        'Time: 01/01/2026, 10:00:00',
        'Reading: 8.75 (SIMULATED)',
        'Please verify immediately.',
      ].join('\n')
    );
  });

  it('never prints "undefined" when fields are missing', () => {
    const message = buildTheftSms({});
    expect(message).not.toMatch(/undefined/i);
    expect(message).toContain('Meter ID: UNKNOWN');
    expect(message).toContain('Reading: -- (SIMULATED)');
  });
});

describe('gridDemo — readings', () => {
  it('formats readings to 2 decimals', () => {
    expect(formatReading(8.75)).toBe('8.75');
    expect(formatReading(1.2)).toBe('1.20');
    expect(formatReading('bad')).toBe('--');
  });

  it('generates normal readings below the theft threshold', () => {
    for (let i = 0; i < 50; i += 1) {
      const v = generateNormalReading();
      expect(v).toBeGreaterThanOrEqual(1.1);
      expect(v).toBeLessThanOrEqual(1.9);
      expect(isTheftReading(v)).toBe(false);
    }
  });

  it('generates abnormal readings above the theft threshold', () => {
    for (let i = 0; i < 50; i += 1) {
      const v = generateTheftReading();
      expect(v).toBeGreaterThan(THEFT_THRESHOLD_KW);
      expect(isTheftReading(v)).toBe(true);
    }
  });
});

describe('gridDemo — alert records', () => {
  it('marks an online DEMO alert as "DEMO — NOT SENT" and not queued', () => {
    const alert = createGridAlert({
      meter: METER,
      reading: 8.75,
      timestamp: 'ts',
      connectivity: CONNECTIVITY.ONLINE,
      smsChannel: SMS_CHANNEL.DEMO,
      now: 1000,
      seq: 1,
    });
    expect(alert.status).toBe(ALERT_STATUS.DEMO_NOT_SENT);
    expect(alert.queued).toBe(false);
    expect(alert.acknowledged).toBe(false);
    expect(alert.smsMessage).toContain('Meter ID: MTR-001');
  });

  it('queues an offline alert as "QUEUED — OFFLINE"', () => {
    const alert = createGridAlert({
      meter: METER,
      reading: 9.1,
      connectivity: CONNECTIVITY.OFFLINE,
      now: 2000,
      seq: 2,
    });
    expect(alert.status).toBe(ALERT_STATUS.QUEUED_OFFLINE);
    expect(alert.queued).toBe(true);
  });

  it('marks an online REAL_SMS alert as PENDING until a provider answers', () => {
    const alert = createGridAlert({
      meter: METER,
      reading: 9.1,
      connectivity: CONNECTIVITY.ONLINE,
      smsChannel: SMS_CHANNEL.REAL_SMS,
      now: 3000,
      seq: 3,
    });
    expect(alert.status).toBe(ALERT_STATUS.PENDING);
  });
});

describe('gridDemo — duplicate protection', () => {
  it('suppresses an exact duplicate alert id', () => {
    const alert = createGridAlert({ meter: METER, reading: 8.75, now: 1000, seq: 1 });
    const first = appendGridAlert([], alert);
    const second = appendGridAlert(first.history, alert);
    expect(first.added).toBe(true);
    expect(second.added).toBe(false);
    expect(second.reason).toMatch(/duplicate/i);
  });

  it('suppresses a repeat for the same meter inside the cooldown window', () => {
    const a = createGridAlert({ meter: METER, reading: 8.75, now: 10_000, seq: 10 });
    const added = appendGridAlert([], a).history;
    const b = createGridAlert({ meter: METER, reading: 9.5, now: 12_000, seq: 11 }); // +2s
    const outcome = appendGridAlert(added, b, { cooldownSeconds: 10 });

    expect(outcome.added).toBe(false);
    expect(outcome.reason).toMatch(/cooldown/i);
  });

  it('still reports a genuinely separate incident (different meter)', () => {
    const a = createGridAlert({ meter: DEMO_METERS[0], reading: 8.75, now: 10_000, seq: 10 });
    const added = appendGridAlert([], a).history;
    const b = createGridAlert({ meter: DEMO_METERS[1], reading: 8.9, now: 10_500, seq: 11 });
    const outcome = appendGridAlert(added, b, { cooldownSeconds: 10 });

    expect(outcome.added).toBe(true);
    expect(outcome.history).toHaveLength(2);
  });
});

describe('gridDemo — queue + acknowledgement', () => {
  it('lists only unacknowledged queued alerts and clears them on acknowledge', () => {
    const offline = createGridAlert({
      meter: METER,
      reading: 9,
      connectivity: CONNECTIVITY.OFFLINE,
      now: 1000,
      seq: 1,
    });
    const online = createGridAlert({ meter: METER, reading: 8, now: 2000, seq: 2 });
    const history = [offline, online];

    expect(queuedGridAlerts(history)).toHaveLength(1);
    expect(queuedGridAlerts(history)[0].alertId).toBe(offline.alertId);

    const acked = acknowledgeGridAlert(history, offline.alertId);
    expect(queuedGridAlerts(acked)).toHaveLength(0);
    expect(acked.find((a) => a.alertId === offline.alertId).acknowledged).toBe(true);
  });
});

describe('gridDemo — persistence', () => {
  let store;
  beforeEach(() => {
    store = fakeStorage();
  });

  it('round-trips alert history through storage', () => {
    const alert = createGridAlert({ meter: METER, reading: 8.75, now: 1000, seq: 1 });
    saveGridAlerts([alert], store);
    const loaded = loadGridAlerts(store);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].alertId).toBe(alert.alertId);
  });

  it('returns an empty list for corrupt or missing storage', () => {
    expect(loadGridAlerts(store)).toEqual([]);
    store.setItem('etd.gridAlerts.v1', '{not json');
    expect(loadGridAlerts(store)).toEqual([]);
  });

  it('clears the stored history', () => {
    saveGridAlerts([createGridAlert({ meter: METER, now: 1, seq: 1 })], store);
    clearGridAlerts(store);
    expect(loadGridAlerts(store)).toEqual([]);
  });
});

describe('gridDemo — helpers', () => {
  it('finds a meter by id with a safe fallback', () => {
    expect(findMeter('MTR-002').meterName).toBe('Block B Meter');
    expect(findMeter('does-not-exist').meterId).toBe(DEMO_METERS[0].meterId);
  });
});
