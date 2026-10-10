export function generateIncidentId() {
  return 'INC-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

export function createSecurityEvent(data = {}) {
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
