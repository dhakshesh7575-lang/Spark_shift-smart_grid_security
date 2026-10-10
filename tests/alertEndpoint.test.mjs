import { describe, it, expect } from 'vitest';
import app from '../server/src/app.mjs';

describe('Alert endpoint', () => {
  it('returns valid JSON on POST', async () => {
    const req = {
      method: 'POST',
      url: '/api/security/alert',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wifi_ssid: 'JioFiber-2.4G',
        bssid_mac: '00:98:D1:38:10:6F',
        local_ip: '192.168.1.5',
        public_ip: '1.1.1.1',
        geolocation: '12.9716,77.5946',
        city: 'Bengaluru',
        transformer: 'TRF-A',
        reject_reason: 'FAILED',
        simulated: true
      })
    };
  });
});
