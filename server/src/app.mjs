const express = require('express');
const { handleSecurityAlert } = await import('./services/AlertService.mjs');
const app = express();
app.use(express.json());

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

module.exports = app;
