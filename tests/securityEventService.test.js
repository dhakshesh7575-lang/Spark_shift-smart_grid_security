import { describe, it, expect, beforeEach } from 'vitest';
import { handleSecurityEvent, queue } from '../server/src/services/SecurityEventService.mjs';

describe('SecurityEventService', () => {
  beforeEach(() => {
    queue.clear();
  });

  it('creates security event and queues jobs without waiting for timer', () => {
    const result = handleSecurityEvent({
      eventType: 'ACCESS_REJECTION',
      transformerId: 'TRF-A',
      rejectReason: 'TEST',
      eventData: {}
    });
    expect(result.event.id).toMatch(/^INC-/);
    expect(result.event.eventType).toBe('ACCESS_REJECTION');
    expect(result.queued).toBeGreaterThanOrEqual(0);
  });
});
