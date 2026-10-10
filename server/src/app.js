const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', testMode: process.env.WHATSAPP_TEST_MODE === 'true' });
});

module.exports = app;
