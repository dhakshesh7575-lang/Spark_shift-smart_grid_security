// Backend tests for the device network report handling (AlertService).
// Covers: default null, accepts values, rejects empty strings, numeric range,
// and the "at most one of {wifi_ssid, lac/cell_id}" rule (warn-only).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleSecurityAlert, resolveNetworkIdentity, queue } from '../server/src/services/AlertService.mjs';

describe('AlertService network identity', () => {
  beforeEach(() => {
    queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults lac and cell_id to null when omitted (existing payloads still work)', () => {
    const result = handleSecurityAlert({ wifi_ssid: 'JioFiber-2.4G' });
    expect(result.status).toBe('accepted');
    expect(result.network.lac).toBeNull();
    expect(result.network.cell_id).toBeNull();
  });

  it('accepts lac and cell_id when Wi-Fi SSID is absent', () => {
    const result = handleSecurityAlert({ lac: 4057, cell_id: '123456' });
    expect(result.network.lac).toBe(4057);
    expect(result.network.cell_id).toBe('123456');
  });

  it('rejects empty / blank strings by converting them to null', () => {
    const { lac, cell_id } = resolveNetworkIdentity({ lac: '', cell_id: '   ' });
    expect(lac).toBeNull();
    expect(cell_id).toBeNull();
  });

  it('drops out-of-range numeric values and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { lac, cell_id } = resolveNetworkIdentity({ lac: 70000, cell_id: -1 });
    expect(lac).toBeNull();
    expect(cell_id).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('prefers Wi-Fi SSID over LAC/Cell ID and warns (defensive case)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { lac, cell_id } = resolveNetworkIdentity({ wifi_ssid: 'JioFiber-2.4G', lac: 4057, cell_id: 99 });
    expect(lac).toBeNull();
    expect(cell_id).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('treats the "Unavailable" sentinel as absent, so GSM values survive', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { lac, cell_id } = resolveNetworkIdentity({ wifi_ssid: 'Unavailable', lac: 4057, cell_id: 123 });
    expect(lac).toBe(4057);
    expect(cell_id).toBe(123);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns all null when nothing is populated (no error)', () => {
    const result = handleSecurityAlert({});
    expect(result.status).toBe('accepted');
    expect(result.network.lac).toBeNull();
    expect(result.network.cell_id).toBeNull();
  });
});
