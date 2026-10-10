import { createSecurityEvent } from '../models/SecurityEvent.mjs';
import { NotificationQueue } from './NotificationQueue.js';
import { getAdminsFromEnv } from '../utils/adminConfig.mjs';

const queue = new NotificationQueue();

export function handleSecurityEvent(payload) {
  const event = createSecurityEvent({
    eventType: payload.eventType || 'ACCESS_REJECTION',
    transformerId: payload.transformerId || null,
    rejectReason: payload.rejectReason || null,
    eventData: payload.eventData || {}
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

  return { event, jobs, queued: jobs.length };
}

export { queue };
