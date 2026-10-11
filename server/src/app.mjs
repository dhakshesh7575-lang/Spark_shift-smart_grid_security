const express = require('express');
const { handleSecurityAlert } = await import('./services/AlertService.mjs');
const { createSmsAlertService } = await import('./services/SmsAlertService.mjs');
const { getSmsConfig } = await import('./utils/smsConfig.mjs');
const app = express();
app.use(express.json());

const smsService = createSmsAlertService({ config: getSmsConfig() });

app.get('/health', (req, res) => {
  res.json({ status: 'ok', testMode: process.env.WHATSAPP_TEST_MODE === 'true' });
});

app.post('/api/security/alert', (req, res) => {
  try {
    const payload = req.body || {};
    const result = handleSecurityAlert(payload);
    if (result.status === 'error') {
      return res.status(400).json({ status: 'error', message: result.message });
    }
    return res.status(200).json({ status: 'accepted', incident_id: result.incident_id, queued: result.queued });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'internal error' });
  }
});

// ---- EB Admin SMS alerts --------------------------------------------------

app.get('/api/alerts', (req, res) => {
  res.json({ status: 'ok', ...smsService.getState(), alerts: smsService.getHistory() });
});

app.post('/api/alerts/sms', async (req, res) => {
  const result = await smsService.handleDeviceRequest({ headers: req.headers, body: req.body || {} });
  res.status(result.httpStatus).json(result.body);
});

app.post('/api/alerts/test', async (req, res) => {
  const result = await smsService.sendTestAlert();
  res.status(200).json({ status: 'accepted', ...result });
});

module.exports = app;
