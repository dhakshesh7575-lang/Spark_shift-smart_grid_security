const path = require('path');

const worker = {
  id: process.env.WHATSAPP_WORKER_ID || 'whatsapp-worker-1',
  status: 'offline',
  sessionStatus: 'disconnected',
  testMode: process.env.WHATSAPP_TEST_MODE !== 'false',
  profileDir: process.env.WHATSAPP_PROFILE_DIR || path.join(__dirname, '../../worker/profile')
};

function setStatus(s) { worker.status = s; }
function setSessionStatus(s) { worker.sessionStatus = s; }

module.exports = { worker, setStatus, setSessionStatus };
