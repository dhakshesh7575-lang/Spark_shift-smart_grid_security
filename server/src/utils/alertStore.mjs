// ---------------------------------------------------------------------------
// server/src/utils/alertStore.mjs
//
// Simplest working persistence for the prototype: a single JSON file.
//
// There is NO database dependency in this project (verified: no sqlite/prisma/
// knex/mongoose and no DATABASE_URL), so this is the simplest correct option.
//
// LIMITATIONS (documented, by design):
//   * Single-process only — concurrent writers can clobber each other.
//   * No query language, no indexes, no transactions.
//   * Writes are best-effort: a failure never breaks the alert path.
//
// If a real database is later configured, swap this module for a DB-backed
// store; the GridAlertService only relies on load()/save().
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

/** Resolve the default data file (server/data/grid-alerts.json). */
export function defaultDataFile() {
  return path.join(process.cwd(), 'server', 'data', 'grid-alerts.json');
}

/**
 * Create a JSON-file store. `file` may be null to disable persistence
 * (keeps everything in memory — used by tests).
 */
export function createAlertStore({ file = defaultDataFile(), limit = 200 } = {}) {
  function load() {
    if (!file) return [];
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save(records) {
    if (!file) return false;
    try {
      const list = Array.isArray(records) ? records.slice(0, limit) : [];
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
      return true;
    } catch {
      // Persistence is best-effort; never throw into the alert path.
      return false;
    }
  }

  return { load, save, file };
}
