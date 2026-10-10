import { createSecurityEvent } from '../models/SecurityEvent.mjs';
import { NotificationQueue } from './NotificationQueue.js';
import { getAdminsFromEnv } from '../utils/adminConfig.mjs';

const queue = new NotificationQueue();

function generateIncidentId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'INC-' + crypto.randomUUID();
  }
  return 'INC-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10).toUpperCase();
}

export function handleSecurityAlert(payload = {}) {
  try {
    const event = createSecurityEvent({
      eventType: payload.eventType || 'ACCESS_REJECTION',
      transformerId: payload.transformerId || payload.transformer || null,
      rejectReason: payload.rejectReason || null,
      eventData: payload.eventData || { ...payload }
    });
    
    const admins = getAdminsFromEnv();
    const jobs = [];
    admins.forEach(num => {
      const job = queue.enqueue({
        incidentId: event.id,
        recipientNumber: num,
        event,
        template: payload.template || 'DEFAULT_ALERT'
      });
      if (job) jobs.push(job);
    });
    
    return { status: 'accepted', incident_id: event.id, queued: jobs.length };
  } catch (err) {
    return { status: 'error', message: 'internal error' };
  }
}

export { queue, generateIncidentId };
