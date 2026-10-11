// ---------------------------------------------------------------------------
// server/src/smsServer.mjs
//
// Runnable, dependency-free backend for the ESP32 EB-Admin SMS alert feature.
//
// Why plain node:http instead of the existing express scaffold? The existing
// server/src/app.mjs requires `express`, which is not installed in this
// project, so it cannot actually run with `node`. This module uses only Node's
// built-in http module, so the whole feature runs for free with zero installs:
//
//     node server/src/smsServer.mjs
//
// Routes
//   GET  /health                        → mode + capability (no secrets)
//   GET  /api/alerts                    → chip-auth alert history + current mode
//   POST /api/alerts/sms                → device-authenticated alert (ESP32 calls this)
//   POST /api/alerts/test               → create a labelled test alert
//   GET  /api/grid-alerts               → meter-reading alert history + queue
//   POST /api/grid-alerts               → abnormal-reading alert (dashboard/ESP32)
//   POST /api/grid-alerts/flush         → retry queued (offline) alerts
//   POST /api/grid-alerts/:id/acknowledge → mark an alert processed
//
// The ESP32 must send:
//     x-device-id:    <DEVICE_ID>
//     x-device-token: <DEVICE_TOKEN>
// ---------------------------------------------------------------------------

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSmsConfig, isRealSmsEnabled, maskPhone } from './utils/smsConfig.mjs';
import { createSmsAlertService } from './services/SmsAlertService.mjs';
import { createGridAlertService } from './services/GridAlertService.mjs';

/** Read and JSON-parse a request body with a hard size cap. */
function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Build the HTTP server. Exported so tests can start it on an ephemeral port.
 */
export function createSmsServer(config = getSmsConfig()) {
  const service = createSmsAlertService({ config });
  const gridService = createGridAlertService({ config });

  const json = (res, statusCode, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, {
          status: 'ok',
          alertMode: config.mode,
          realSmsEnabled: isRealSmsEnabled(config),
          admin: maskPhone(config.adminPhone),
          grid: gridService.getState(),
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/alerts') {
        return json(res, 200, { status: 'ok', ...service.getState(), alerts: service.getHistory() });
      }

      // ---- grid (meter-reading) alerts -----------------------------------
      if (req.method === 'GET' && url.pathname === '/api/grid-alerts') {
        return json(res, 200, { status: 'ok', ...gridService.getState(), alerts: gridService.list() });
      }

      if (req.method === 'POST' && url.pathname === '/api/grid-alerts') {
        let body;
        try {
          body = await readJson(req);
        } catch (err) {
          return json(res, 400, { status: 'error', message: err.message });
        }
        const clientKey = (req.socket && req.socket.remoteAddress) || 'anon';
        const result = await gridService.handleHttpRequest({ headers: req.headers, body, clientKey });
        return json(res, result.httpStatus, result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/grid-alerts/flush') {
        const result = await gridService.flush();
        return json(res, 200, { status: 'ok', ...result });
      }

      const ackMatch = url.pathname.match(/^\/api\/grid-alerts\/([^/]+)\/acknowledge$/);
      if (req.method === 'POST' && ackMatch) {
        const result = gridService.acknowledge(decodeURIComponent(ackMatch[1]));
        return json(res, result.ok ? 200 : 404, {
          status: result.ok ? 'ok' : 'error',
          message: result.ok ? undefined : result.reason,
          alert: result.record,
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/alerts/sms') {
        let body;
        try {
          body = await readJson(req);
        } catch (err) {
          return json(res, 400, { status: 'error', message: err.message });
        }
        const result = await service.handleDeviceRequest({ headers: req.headers, body });
        return json(res, result.httpStatus, result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/alerts/test') {
        if (isRealSmsEnabled(config)) {
          // Guard the real-SMS path with device auth so untrusted callers
          // cannot fire arbitrary paid messages.
          const { checkDeviceAuth } = await import('./services/DeviceAuth.mjs');
          const auth = checkDeviceAuth(req.headers, config);
          if (!auth.ok) return json(res, 401, { status: 'error', message: auth.reason });
        }
        const result = await service.sendTestAlert();
        return json(res, 200, { status: 'accepted', ...result });
      }

      return json(res, 404, { status: 'error', message: 'not found' });
    } catch {
      return json(res, 500, { status: 'error', message: 'internal error' });
    }
  });

  return { server, service, config };
}

/** Start the server when this module is executed directly. */
export function startSmsServer(config = getSmsConfig()) {
  const { server } = createSmsServer(config);
  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `SMS alert backend listening on http://localhost:${config.port} ` +
        `(mode=${config.mode}, realSms=${isRealSmsEnabled(config)}, admin=${maskPhone(config.adminPhone)})`
    );
  });
  return server;
}

// Only auto-start when run as the entry point (not when imported by tests).
const invokedDirectly = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  startSmsServer();
}
