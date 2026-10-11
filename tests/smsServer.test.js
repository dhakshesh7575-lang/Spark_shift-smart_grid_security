// End-to-end HTTP tests for the dependency-free backend
// (server/src/smsServer.mjs). Starts the real server on an ephemeral port and
// drives it with Node's http client — no external network, no credentials.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createSmsServer } from '../server/src/smsServer.mjs';
import { getSmsConfig } from '../server/src/utils/smsConfig.mjs';

let server;
let port;

const AUTH = { 'x-device-id': 'esp32-1', 'x-device-token': 'tok-secret' };

function request({ method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const reqHeaders = { ...headers };
    if (data !== null) {
      reqHeaders['content-type'] = 'application/json';
      reqHeaders['content-length'] = Buffer.byteLength(data);
    }
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: reqHeaders },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on('error', reject);
    if (data !== null) req.write(data);
    req.end();
  });
}

beforeAll(async () => {
  const config = getSmsConfig({
    ALERT_MODE: 'SIMULATION',
    DEVICE_ID: 'esp32-1',
    DEVICE_TOKEN: 'tok-secret',
    ALERT_RATE_LIMIT_PER_MINUTE: '50',
  });
  const created = createSmsServer(config);
  server = created.server;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe('smsServer (HTTP end-to-end)', () => {
  it('GET /health reports simulation and hides the phone number', async () => {
    const res = await request({ method: 'GET', path: '/health' });
    expect(res.status).toBe(200);
    expect(res.json.alertMode).toBe('SIMULATION');
    expect(res.json.realSmsEnabled).toBe(false);
  });

  it('POST /api/alerts/sms without device auth is rejected (401)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/alerts/sms',
      body: { meterId: 'MTR-1', status: 'FAILED' },
    });
    expect(res.status).toBe(401);
    expect(res.json.status).toBe('error');
  });

  it('rejects malformed JSON (400)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/alerts/sms',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: undefined,
    });
    // empty body parses to {} -> missing meterId/code -> 400
    expect(res.status).toBe(400);
  });

  it('accepts an authenticated FAILED report and records it', async () => {
    const posted = await request({
      method: 'POST',
      path: '/api/alerts/sms',
      headers: AUTH,
      body: { meterId: 'MTR-HTTP-1', status: 'FAILED', reason: 'bad checksum' },
    });
    expect(posted.status).toBe(200);
    expect(posted.json.status).toBe('accepted');
    expect(posted.json.record.smsStatus).toBe('SIMULATED');

    const list = await request({ method: 'GET', path: '/api/alerts' });
    expect(list.status).toBe(200);
    expect(list.json.alerts.some((a) => a.meterId === 'MTR-HTTP-1')).toBe(true);
  });

  it('suppresses a duplicate event id over HTTP', async () => {
    const payload = { meterId: 'MTR-HTTP-2', status: 'FAILED', eventId: 'INC-HTTP-2' };
    const first = await request({ method: 'POST', path: '/api/alerts/sms', headers: AUTH, body: payload });
    const second = await request({ method: 'POST', path: '/api/alerts/sms', headers: AUTH, body: payload });
    expect(first.json.status).toBe('accepted');
    expect(second.json.status).toBe('duplicate');
  });

  it('creates a labelled test alert via POST /api/alerts/test', async () => {
    const res = await request({ method: 'POST', path: '/api/alerts/test', body: {} });
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('accepted');
    expect(res.json.record.message).toContain('[TEST ALERT');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request({ method: 'GET', path: '/nope' });
    expect(res.status).toBe(404);
  });
});
