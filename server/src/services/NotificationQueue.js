const crypto = require('crypto');

class NotificationQueue {
  constructor() {
    this.jobs = new Map(); // key -> job
    this.processed = new Set();
  }

  _makeKey(incidentId, recipientNumber) {
    return crypto.createHash('sha256').update(incidentId + '|' + recipientNumber).digest('hex');
  }

  enqueue(job) {
    const { incidentId, recipientNumber } = job;
    if (!incidentId || !recipientNumber) return null;
    const key = this._makeKey(incidentId, recipientNumber);
    if (this.processed.has(key)) return null; // dedup
    if (this.jobs.has(key)) return this.jobs.get(key);
    const queued = {
      id: key,
      incidentId,
      recipientNumber,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      error: null,
      ...job
    };
    this.jobs.set(key, queued);
    return queued;
  }

  getJobs() {
    return Array.from(this.jobs.values());
  }

  markProcessing(id) {
    const j = this.jobs.get(id);
    if (j) { j.status = 'PROCESSING'; j.lastAttemptAt = new Date().toISOString(); this.jobs.set(id, j); }
  }

  markSuccess(id) {
    const j = this.jobs.get(id);
    if (j) {
      j.status = 'SUCCESS';
      j.completedAt = new Date().toISOString();
      this.jobs.set(id, j);
      this.processed.add(id);
    }
  }

  markFailed(id, err) {
    const j = this.jobs.get(id);
    if (j) {
      j.attempts = (j.attempts || 0) + 1;
      j.error = err || 'unknown';
      if (j.attempts >= j.maxAttempts) {
        j.status = 'FAILED';
        this.processed.add(id);
      } else {
        j.status = 'RETRYING';
      }
      this.jobs.set(id, j);
    }
  }

  clear() {
    this.jobs.clear();
    this.processed.clear();
  }
}

module.exports = { NotificationQueue };
