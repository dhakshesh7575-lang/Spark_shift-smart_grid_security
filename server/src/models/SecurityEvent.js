const SecurityEvent = {
  id: null, // incident_id (server-generated)
  eventType: 'ACCESS_REJECTION', // or 'CONFIRMED_THEFT'
  timestamp: null, // server-generated ISO
  transformerId: null,
  rejectReason: null,
  eventData: {}, // raw payload (no sensitive session data)
  createdAt: null,
  updatedAt: null
};

function createSecurityEvent(data) {
  const now = new Date().toISOString();
  return {
    id: data.id || generateIncidentId(),
    eventType: data.eventType || 'ACCESS_REJECTION',
    timestamp: data.timestamp || now,
    transformerId: data.transformerId || null,
    rejectReason: data.rejectReason || null,
    eventData: data.eventData || {},
    createdAt: now,
    updatedAt: now
  };
}

function generateIncidentId() {
  // Server-generated unique incident ID
  return 'INC-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

module.exports = { SecurityEvent, createSecurityEvent, generateIncidentId };
