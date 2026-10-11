import { describe, it, expect, afterEach, vi } from 'vitest';
import { format_alert } from '../server/src/utils/messageFormatter.mjs';

describe('Message formatter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats with simulated flag', () => {
    const msg = format_alert({ simulated: true, wifi_ssid: 'JioFiber-2.4G' });
    expect(msg.split('\n')[0]).toBe('[SIMULATED DATA]');
  });

  it('uses Unavailable for missing', () => {
    const msg = format_alert({});
    expect(msg).toContain('Local IP: Unavailable');
    expect(msg).toContain('Public IP: Unavailable');
  });

  it('(a) Wi-Fi present: SSID shows, LAC/Cell ID render as absent', () => {
    const msg = format_alert({ wifi_ssid: 'JioFiber-2.4G' });
    expect(msg.split('\n').slice(0, 3)).toEqual([
      'Wi-Fi SSID: JioFiber-2.4G',
      'LAC: Unavailable',
      'Cell ID: Unavailable',
    ]);
    expect(msg).not.toContain('undefined');
  });

  it('(b) LAC + Cell ID present: SSID absent, GSM lines render below it', () => {
    const msg = format_alert({ lac: 4057, cell_id: '123456' });
    expect(msg.split('\n').slice(0, 3)).toEqual([
      'Wi-Fi SSID: Unavailable',
      'LAC: 4057',
      'Cell ID: 123456',
    ]);
    expect(msg).not.toContain('undefined');
  });

  it('(c) all absent: every network field renders as "Unavailable"', () => {
    const msg = format_alert({});
    expect(msg.split('\n').slice(0, 3)).toEqual([
      'Wi-Fi SSID: Unavailable',
      'LAC: Unavailable',
      'Cell ID: Unavailable',
    ]);
    expect(msg).not.toContain('undefined');
  });

  it('(defensive) both present: Wi-Fi wins, GSM hidden, warning logged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const msg = format_alert({ wifi_ssid: 'JioFiber-2.4G', lac: 4057, cell_id: 123456 });
    expect(msg).toContain('Wi-Fi SSID: JioFiber-2.4G');
    expect(msg).toContain('LAC: Unavailable');
    expect(msg).toContain('Cell ID: Unavailable');
    expect(msg).not.toContain('undefined');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

