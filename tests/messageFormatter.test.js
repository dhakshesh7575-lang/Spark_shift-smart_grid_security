import { describe, it, expect } from 'vitest';
import { format_alert } from '../server/src/utils/messageFormatter.mjs';

describe('Message formatter', () => {
  it('formats with simulated flag', () => {
    const msg = format_alert({ simulated: true, wifi_ssid: 'JioFiber-2.4G' });
    expect(msg.split('\n')[0]).toBe('[SIMULATED DATA]');
  });
  
  it('uses Unavailable for missing', () => {
    const msg = format_alert({});
    expect(msg).toContain('Local IP: Unavailable');
    expect(msg).toContain('Public IP: Unavailable');
  });
});
