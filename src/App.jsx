// ---------------------------------------------------------------------------
// src/App.jsx
//
// Root component.  Owns the shared state (logs + last captured theft + grid
// demo alerts) and the layout described in the spec:
//
//   +--------------------------------------------------+
//   |                 ADMIN SERVER (top 50%)           |
//   +---------------+---------------+------------------+
//   | AUTHORISED    | GRID SECURITY | THIEF PANEL      |
//   | METER (25%)   | DEMO (25%)    | (25%)            |
//   +---------------+---------------+------------------+
//
// Callbacks (`onVerify`, `onTheftAttempt`, grid-demo handlers) are passed down;
// children never mutate each other's state directly.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from 'react';
import AdminServer from './components/AdminServer';
import AuthorisedMeter from './components/AuthorisedMeter';
import ThiefPanel from './components/ThiefPanel';
import GridDemoPanel from './components/GridDemoPanel';
import Sidebar from './components/sidebar/Sidebar';
import { verifyCode } from './logic/verification';
import { generateWifiTrace } from './logic/wifiTrace';
import { resolveNetworkDisplay } from './logic/networkDisplay';
import { getAlertConfig } from './logic/alertConfig';
import { fetchBackendAlerts } from './logic/backendSync';
import { postGridAlert, flushBackendQueue } from './logic/gridAlertsApi';
import {
  ALERT_STATUS,
  CONNECTIVITY,
  DEFAULT_GRID_COOLDOWN_SECONDS,
  DEMO_METERS,
  DEFAULT_METER_ID,
  SMS_CHANNEL,
  acknowledgeGridAlert,
  appendGridAlert,
  clearGridAlerts,
  createGridAlert,
  findMeter,
  formatReading,
  generateNormalReading,
  generateTheftReading,
  loadGridAlerts,
  queuedGridAlerts,
  saveGridAlerts,
  updateGridAlert,
} from './logic/gridDemo';
import {
  ALERT_MODES,
  DEFAULT_COOLDOWN_SECONDS,
  appendAlert,
  clearAlertHistory,
  createSmsAlert,
  loadAlertHistory,
  mergeBackendAlerts,
  saveAlertHistory,
} from './logic/smsAlerts';
import { AUTHORISED_METER } from './logic/constants';
import './App.css';

// Monotonic id source for log lines (module scope so it survives re-renders).
let LOG_SEQ = 0;

/** Current wall-clock time as HH:MM:SS for log prefixes. */
function nowTime() {
  return new Date().toLocaleTimeString();
}

export default function App() {
  // ---- shared state -----------------------------------------------------
  const [logs, setLogs] = useState(() => [
    {
      id: ++LOG_SEQ,
      time: nowTime(),
      status: 'INFO',
      message: 'Admin Office Server online. Awaiting chip handshakes…',
    },
  ]);
  const [lastTheft, setLastTheft] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // ---- EB admin SMS alert state ---------------------------------------
  const [alertConfig] = useState(() => getAlertConfig());
  const [smsAlerts, setSmsAlerts] = useState(() => loadAlertHistory());
  const [syncingAlerts, setSyncingAlerts] = useState(false);

  // ---- grid security DEMO state ---------------------------------------
  // Meter readings, connectivity, the offline queue and alert records.
  const [selectedMeterId, setSelectedMeterId] = useState(DEFAULT_METER_ID);
  const [gridReading, setGridReading] = useState(null);
  const [connectivity, setConnectivity] = useState(CONNECTIVITY.ONLINE);
  const [gridAlerts, setGridAlerts] = useState(() => loadGridAlerts());

  // The dashboard is "real SMS ready" only when configured AND a backend URL
  // is present — otherwise it stays in truthful DEMO mode.
  const providerConfigured =
    alertConfig.mode === ALERT_MODES.REAL_SMS && !!alertConfig.backendUrl;

  /** Append a line to the Admin Server log. */
  const pushLog = useCallback((status, message) => {
    setLogs((prev) => [...prev, { id: ++LOG_SEQ, time: nowTime(), status, message }]);
  }, []);

  /** Show a transient toast (used by "SHARE LOCATION"). */
  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ---- authorised meter → server ---------------------------------------
  // Called automatically by the meter every 30s.  Always verifies.
  // NOTE: a VERIFIED handshake intentionally generates NO SMS alert.
  const handleAuthorisedVerify = useCallback(
    (code) => {
      const result = verifyCode(code);
      if (result.status === 'VERIFIED') {
        pushLog(
          'VERIFIED',
          `Meter ${AUTHORISED_METER.meterId} (${result.transformerId}) — verification done, ` +
            'electricity flow is secured, electricity flow continues'
        );
      } else {
        // Should never happen with the authorised code, but log defensively.
        pushLog('FAILED', `Authorised meter rejected — ${result.reason}`);
      }
      return result;
    },
    [pushLog]
  );

  // ---- thief → server ---------------------------------------------------
  // Every click produces a NEW thief trace with fresh random details, and a
  // SIMULATED SMS alert for the EB admin (duplicates are suppressed).
  const handleThiefAttempt = useCallback(
    (code, strategy) => {
      const result = verifyCode(code); // ALWAYS FAILED by construction
      const trace = generateWifiTrace(result.transformerId);

      setLastTheft({ ...trace, code, strategy, reason: result.reason });

      pushLog(
        'FAILED',
        `UNAUTHORISED code "${code}" rejected — ${result.reason}. ` +
          `Trace captured under ${trace.transformerId}.`
      );

      // Only a failed authentication reaches this point, so an alert is
      // always warranted here (subject to duplicate suppression).
      const alert = createSmsAlert({
        meterId: result.meterId,
        reason: result.reason,
        eventTime: new Date().toLocaleString(),
        code,
        mode: alertConfig.mode,
      });

      const outcome = appendAlert(smsAlerts, alert, {
        cooldownSeconds: DEFAULT_COOLDOWN_SECONDS,
      });

      if (outcome.added) {
        setSmsAlerts(outcome.history);
        saveAlertHistory(outcome.history);
        pushLog(
          'INFO',
          alertConfig.mode === ALERT_MODES.REAL_SMS
            ? `SMS alert ${alert.eventId} queued to EB admin (REAL_SMS).`
            : `SIMULATED SMS ${alert.eventId} generated for EB admin — NOT actually sent.`
        );
      } else if (outcome.duplicate) {
        pushLog('INFO', `Duplicate theft event suppressed — ${outcome.reason}.`);
      }
    },
    [pushLog, alertConfig, smsAlerts]
  );

  // ---- EB admin SMS: safe test alert ------------------------------------
  // Generates a clearly-labelled TEST alert without any real theft/hardware.
  const handleTestAlert = useCallback(() => {
    const alert = createSmsAlert({
      meterId: 'MTR-TEST-001',
      reason: 'Manual test of the SMS alert system',
      eventTime: new Date().toLocaleString(),
      mode: alertConfig.mode,
      test: true,
    });
    const outcome = appendAlert(smsAlerts, alert);
    setSmsAlerts(outcome.history);
    saveAlertHistory(outcome.history);
    pushLog(
      'INFO',
      alertConfig.mode === ALERT_MODES.REAL_SMS
        ? 'Test SMS alert dispatched via backend (REAL_SMS).'
        : 'Test SMS alert generated — SIMULATION only, nothing was sent.'
    );
  }, [smsAlerts, alertConfig, pushLog]);

  // ---- EB admin SMS: clear history --------------------------------------
  const handleClearAlerts = useCallback(() => {
    clearAlertHistory();
    setSmsAlerts([]);
    pushLog('INFO', 'SMS alert history cleared.');
  }, [pushLog]);

  // ---- EB admin SMS: sync from the backend (optional) -------------------
  // Only useful when a backend URL is configured; pulls alerts (including real
  // provider responses) from GET /api/alerts. Never throws.
  const handleSyncAlerts = useCallback(async () => {
    setSyncingAlerts(true);
    const res = await fetchBackendAlerts(alertConfig.backendUrl);
    setSyncingAlerts(false);

    if (!res.ok) {
      pushLog('INFO', `SMS backend sync skipped/failed — ${res.reason}.`);
      return;
    }

    const merged = mergeBackendAlerts(smsAlerts, res.alerts);
    setSmsAlerts(merged.history);
    saveAlertHistory(merged.history);
    pushLog('INFO', `Synced ${merged.added} new SMS alert(s) from the backend.`);
  }, [alertConfig.backendUrl, smsAlerts, pushLog]);

  // ---- grid security DEMO: helpers ------------------------------------
  /** Persist + set the grid alert history. */
  const commitGridAlerts = useCallback((next) => {
    setGridAlerts(next);
    saveGridAlerts(next);
  }, []);

  /** Patch one alert record by id (safe/functional). */
  const patchGridAlert = useCallback((alertId, patch) => {
    setGridAlerts((prev) => {
      const next = updateGridAlert(prev, alertId, patch);
      saveGridAlerts(next);
      return next;
    });
  }, []);

  /**
   * Deliver an alert on the configured SMS channel.
   * DEMO (default): nothing is sent — status "DEMO — NOT SENT".
   * REAL_SMS: the browser POSTs to the backend (which holds the provider key
   * and the authorised number). The status reflects the backend response and
   * is never upgraded to "Delivered".
   */
  const deliverGridAlert = useCallback(
    async (alert, { fallback = false } = {}) => {
      const channel = alert.smsChannel || SMS_CHANNEL.DEMO;

      if (channel !== SMS_CHANNEL.REAL_SMS || !alertConfig.backendUrl) {
        patchGridAlert(alert.alertId, {
          status: ALERT_STATUS.DEMO_NOT_SENT,
          queued: false,
        });
        pushLog(
          'INFO',
          `Alert ${alert.alertId} (${alert.meterId}) — DEMO mode, SMS not actually sent` +
            (fallback ? ' (SMS fallback simulation).' : '.')
        );
        return;
      }

      const res = await postGridAlert(alertConfig.backendUrl, alert);
      patchGridAlert(alert.alertId, {
        status: res.statusLabel,
        queued: res.statusLabel === ALERT_STATUS.QUEUED_OFFLINE,
        providerResponse: res.providerResponse,
      });
      pushLog(
        res.ok ? 'INFO' : 'FAILED',
        `Alert ${alert.alertId} → backend: ${res.statusLabel}` +
          (res.reason ? ` (${res.reason})` : '') +
          (fallback ? ' [SMS fallback].' : '.')
      );
    },
    [alertConfig.backendUrl, patchGridAlert, pushLog]
  );

  // ---- grid security DEMO: controls -----------------------------------
  /** Normal reading — no alert is raised. */
  const handleNormalReading = useCallback(() => {
    const meter = findMeter(selectedMeterId);
    const value = generateNormalReading();
    setGridReading({ value, kind: 'NORMAL', timestamp: new Date().toLocaleString() });
    pushLog(
      'VERIFIED',
      `Meter ${meter.meterId} (${meter.meterName}) normal reading ` +
        `${formatReading(value)} kW — within limits, no alert.`
    );
  }, [selectedMeterId, pushLog]);

  /** Suspected theft — creates an alert record, queues if offline. */
  const handleTheftReading = useCallback(() => {
    const meter = findMeter(selectedMeterId);
    const value = generateTheftReading();
    const timestamp = new Date().toLocaleString();
    setGridReading({ value, kind: 'THEFT', timestamp });

    const alert = createGridAlert({
      meter,
      reading: value,
      timestamp,
      connectivity,
      smsChannel: providerConfigured ? SMS_CHANNEL.REAL_SMS : SMS_CHANNEL.DEMO,
    });

    const outcome = appendGridAlert(gridAlerts, alert, {
      cooldownSeconds: DEFAULT_GRID_COOLDOWN_SECONDS,
    });

    if (!outcome.added) {
      pushLog('INFO', `Duplicate alert suppressed — ${outcome.reason}.`);
      return;
    }

    commitGridAlerts(outcome.history);
    pushLog(
      'FAILED',
      `THEFT suspected at ${meter.meterId} (${meter.meterName}) — reading ` +
        `${formatReading(value)} kW. Alert ${alert.alertId}.`
    );

    if (connectivity === CONNECTIVITY.OFFLINE) {
      pushLog(
        'INFO',
        `Wi-Fi/backend unavailable — alert ${alert.alertId} QUEUED offline ` +
          '(SMS fallback pending acknowledgement).'
      );
      return;
    }

    deliverGridAlert(alert);
  }, [selectedMeterId, connectivity, providerConfigured, gridAlerts, commitGridAlerts, deliverGridAlert, pushLog]);

  /** Simulate Wi-Fi / backend outage — subsequent alerts queue offline. */
  const handleWifiUnavailable = useCallback(() => {
    setConnectivity(CONNECTIVITY.OFFLINE);
    pushLog('INFO', 'Wi-Fi / backend marked UNAVAILABLE (simulated). New alerts will queue offline.');
  }, [pushLog]);

  /** Restore connectivity — flush the offline queue. */
  const handleRestoreConnectivity = useCallback(async () => {
    setConnectivity(CONNECTIVITY.ONLINE);
    const pending = queuedGridAlerts(gridAlerts);
    pushLog(
      'INFO',
      `Connectivity RESTORED (simulated). Flushing ${pending.length} queued alert(s)…`
    );

    for (const alert of pending) {
      // eslint-disable-next-line no-await-in-loop
      await deliverGridAlert(alert);
    }

    if (alertConfig.backendUrl) {
      // Best-effort: also flush anything the backend itself queued.
      const res = await flushBackendQueue(alertConfig.backendUrl);
      if (res.ok && res.flushed > 0) {
        pushLog('INFO', `Backend flushed ${res.flushed} queued alert(s).`);
      }
    }
  }, [gridAlerts, deliverGridAlert, pushLog, alertConfig.backendUrl]);

  /** SMS fallback simulation — attempt delivery of the queued alerts. */
  const handleSmsFallback = useCallback(async () => {
    const pending = queuedGridAlerts(gridAlerts);
    if (pending.length === 0) {
      pushLog('INFO', 'SMS fallback: no queued alerts to deliver.');
      return;
    }
    if (connectivity === CONNECTIVITY.OFFLINE) {
      pushLog(
        'INFO',
        `SMS fallback: still offline — ${pending.length} alert(s) remain queued ` +
          '(no message sent).'
      );
      return;
    }
    pushLog('INFO', `SMS fallback: attempting delivery of ${pending.length} queued alert(s)…`);
    for (const alert of pending) {
      // eslint-disable-next-line no-await-in-loop
      await deliverGridAlert(alert, { fallback: true });
    }
  }, [gridAlerts, connectivity, deliverGridAlert, pushLog]);

  /** Acknowledge / process an alert (removes it from the active queue). */
  const handleAcknowledgeGridAlert = useCallback(
    (alertId) => {
      commitGridAlerts(acknowledgeGridAlert(gridAlerts, alertId));
      pushLog('INFO', `Alert ${alertId} acknowledged and processed.`);
    },
    [gridAlerts, commitGridAlerts, pushLog]
  );

  /** Clear the demo alert history. */
  const handleClearGridAlerts = useCallback(() => {
    clearGridAlerts();
    setGridAlerts([]);
    pushLog('INFO', 'Grid alert history cleared.');
  }, [pushLog]);

  // ---- share captured location -----------------------------------------
  const handleShareLocation = useCallback(() => {
    if (!lastTheft) return;

    const net = resolveNetworkDisplay(lastTheft);

    const report =
      `SMART-GRID THEFT TRACE REPORT\n` +
      `Timestamp: ${lastTheft.timestampLocal}\n` +
      `SSID: ${net.ssid}\n` +
      `LAC: ${net.lac}\n` +
      `Cell ID: ${net.cellId}\n` +
      `BSSID/MAC: ${lastTheft.bssid}\n` +
      `Local IP: ${lastTheft.localIp}\n` +
      `Public IP: ${lastTheft.publicIp}\n` +
      `Geolocation: ${lastTheft.lat}, ${lastTheft.lng} (${lastTheft.city}, ${lastTheft.country})\n` +
      `Transformer: ${lastTheft.transformerId} — ${lastTheft.transformerLabel}\n` +
      `Reason: ${lastTheft.reason}\n`;

    // Best-effort clipboard copy — ignore failures (e.g. insecure context).
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).catch(() => {});
    }

    showToast('Location shared with authorities.');
    pushLog('INFO', 'Thief location shared with authorities.');
  }, [lastTheft, pushLog, showToast]);

  return (
    <div className="app-shell">
      {/* ---------------- LEFT SIDEBAR (narrows the layout only) ---------------- */}
      <Sidebar />

      <div className="app">
        {/* ---------------- TOP HALF: Admin Server ---------------- */}
        <AdminServer
          logs={logs}
          lastTheft={lastTheft}
          onShareLocation={handleShareLocation}
          alerts={smsAlerts}
          alertMode={alertConfig.mode}
          adminNumber={alertConfig.adminNumber}
          canSync={!!alertConfig.backendUrl}
          syncing={syncingAlerts}
          onTestAlert={handleTestAlert}
          onClearAlerts={handleClearAlerts}
          onSyncAlerts={handleSyncAlerts}
        />

        {/* ---------------- BOTTOM HALF: Meter + Grid Demo + Thief ---------------- */}
        <div className="bottom-half">
          <AuthorisedMeter meter={AUTHORISED_METER} onVerify={handleAuthorisedVerify} />
          <GridDemoPanel
            meters={DEMO_METERS}
            selectedMeterId={selectedMeterId}
            onSelectMeter={setSelectedMeterId}
            reading={gridReading}
            connectivity={connectivity}
            smsChannel={providerConfigured ? SMS_CHANNEL.REAL_SMS : SMS_CHANNEL.DEMO}
            queueCount={queuedGridAlerts(gridAlerts).length}
            providerConfigured={providerConfigured}
            alerts={gridAlerts}
            onNormalReading={handleNormalReading}
            onTheftReading={handleTheftReading}
            onWifiUnavailable={handleWifiUnavailable}
            onRestoreConnectivity={handleRestoreConnectivity}
            onSmsFallback={handleSmsFallback}
            onAcknowledge={handleAcknowledgeGridAlert}
            onClearAlerts={handleClearGridAlerts}
          />
          <ThiefPanel onTheftAttempt={handleThiefAttempt} />
        </div>

        {/* ---------------- Toast notification ---------------- */}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
