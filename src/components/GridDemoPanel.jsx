// ---------------------------------------------------------------------------
// src/components/GridDemoPanel.jsx
//
// Hackathon demo control + alert dashboard for the Smart Grid Security system.
//
// Buttons drive the whole demonstration with real (simulated) data:
//   NORMAL READING · SUSPECT THEFT · WI-FI/BACKEND DOWN · RESTORE · SMS FALLBACK
//
// It shows a clearly-labelled DEMO badge, the live meter reading, connectivity,
// the offline-queue count, and the alert records (meter id, name, location,
// timestamp, reading, reason, status).
// ---------------------------------------------------------------------------

import {
  ALERT_STATUS,
  CONNECTIVITY,
  SMS_CHANNEL,
  formatReading,
} from '../logic/gridDemo';

export default function GridDemoPanel({
  meters = [],
  selectedMeterId,
  onSelectMeter,
  reading,
  connectivity = CONNECTIVITY.ONLINE,
  smsChannel = SMS_CHANNEL.DEMO,
  queueCount = 0,
  providerConfigured = false,
  alerts = [],
  onNormalReading,
  onTheftReading,
  onWifiUnavailable,
  onRestoreConnectivity,
  onSmsFallback,
  onAcknowledge,
  onClearAlerts,
}) {
  const offline = connectivity === CONNECTIVITY.OFFLINE;

  return (
    <section className="panel bottom-mid grid-demo-panel">
      <header className="panel-header">
        <span className={`status-dot ${offline ? 'dot-red' : 'dot-green'}`} />
        <h2 className="panel-title">GRID SECURITY DEMO</h2>
        <span className="demo-badge">DEMO MODE</span>
      </header>

      <div className="grid-demo-body">
        {/* ---- status strip ---- */}
        <div className="demo-status-strip">
          <span className={`chip ${offline ? 'chip-offline' : 'chip-online'}`}>
            {offline ? 'WI-FI / BACKEND: DOWN' : 'WI-FI / BACKEND: ONLINE'}
          </span>
          <span className={`chip ${providerConfigured ? 'chip-online' : 'chip-demo'}`}>
            {providerConfigured ? 'REAL SMS READY' : 'SMS: DEMO ONLY'}
          </span>
          <span className="chip chip-queue">QUEUE: {queueCount}</span>
        </div>

        {/* ---- meter + reading ---- */}
        <div className="demo-meter-row">
          <label className="demo-label" htmlFor="grid-meter-select">
            Meter
          </label>
          <select
            id="grid-meter-select"
            className="demo-select"
            value={selectedMeterId}
            onChange={(e) => onSelectMeter(e.target.value)}
          >
            {meters.map((m) => (
              <option key={m.meterId} value={m.meterId}>
                {m.meterId} — {m.meterName}
              </option>
            ))}
          </select>
        </div>

        <div className="demo-reading">
          <span className="demo-reading-label">SIMULATED READING</span>
          {reading ? (
            <>
              <span className={`demo-reading-value ${reading.kind === 'THEFT' ? 'is-theft' : 'is-normal'}`}>
                {formatReading(reading.value)} <small>kW</small>
              </span>
              <span className={`demo-reading-kind ${reading.kind === 'THEFT' ? 'is-theft' : 'is-normal'}`}>
                {reading.kind === 'THEFT' ? 'ABNORMAL — THEFT SUSPECTED' : 'NORMAL'}
              </span>
              <span className="demo-reading-time">{reading.timestamp}</span>
            </>
          ) : (
            <span className="demo-reading-value demo-reading-idle">—</span>
          )}
        </div>

        {/* ---- controls ---- */}
        <div className="demo-controls">
          <button className="demo-btn demo-btn--normal" onClick={onNormalReading} type="button">
            ✅ NORMAL READING
          </button>
          <button className="demo-btn demo-btn--theft" onClick={onTheftReading} type="button">
            ⚠ SUSPECT THEFT
          </button>
          <button
            className="demo-btn demo-btn--offline"
            onClick={onWifiUnavailable}
            disabled={offline}
            type="button"
          >
            📴 WI-FI / BACKEND DOWN
          </button>
          <button
            className="demo-btn demo-btn--restore"
            onClick={onRestoreConnectivity}
            disabled={!offline}
            type="button"
          >
            🔌 RESTORE CONNECTIVITY
          </button>
          <button className="demo-btn demo-btn--fallback" onClick={onSmsFallback} type="button">
            📶 SMS FALLBACK
          </button>
        </div>

        {/* ---- alert records ---- */}
        <div className="demo-alerts-head">
          <span>ALERT RECORDS ({alerts.length})</span>
          <button
            className="demo-clear-btn"
            onClick={onClearAlerts}
            disabled={alerts.length === 0}
            type="button"
          >
            CLEAR ALL
          </button>
        </div>

        <div className="demo-alerts">
          {alerts.length === 0 && (
            <div className="demo-alerts-empty">
              No alerts yet. Use <b>SUSPECT THEFT</b> to raise one.
            </div>
          )}

          {alerts.map((a) => (
            <div className="alert-record" key={a.alertId}>
              <div className="alert-record-top">
                <span className="alert-record-id">{a.meterId}</span>
                <span
                  className={`alert-status ${
                    a.status === ALERT_STATUS.FAILED_NOT_SENT
                      ? 'alert-status--fail'
                      : a.status === ALERT_STATUS.QUEUED_OFFLINE
                        ? 'alert-status--queued'
                        : a.status === ALERT_STATUS.SMS_REQUEST_ACCEPTED
                          ? 'alert-status--ok'
                          : 'alert-status--demo'
                  }`}
                >
                  {a.status}
                </span>
              </div>

              <div className="alert-record-grid">
                <span className="ar-label">Meter name</span>
                <span className="ar-value">{a.meterName}</span>
                <span className="ar-label">Location</span>
                <span className="ar-value">{a.location}</span>
                <span className="ar-label">Time</span>
                <span className="ar-value">{a.timestamp}</span>
                <span className="ar-label">Reading</span>
                <span className="ar-value">{formatReading(a.reading)} (SIMULATED)</span>
                <span className="ar-label">Reason</span>
                <span className="ar-value">{a.reason}</span>
                <span className="ar-label">Alert ID</span>
                <span className="ar-value mono">{a.alertId}</span>
              </div>

              <pre className="alert-sms">{a.smsMessage}</pre>

              {a.providerResponse != null && (
                <div className="alert-provider">
                  Provider response:{' '}
                  {typeof a.providerResponse === 'string'
                    ? a.providerResponse
                    : JSON.stringify(a.providerResponse)}
                </div>
              )}

              <div className="alert-record-foot">
                {a.acknowledged ? (
                  <span className="alert-acked">✔ ACKNOWLEDGED</span>
                ) : (
                  <button
                    className="alert-ack-btn"
                    onClick={() => onAcknowledge(a.alertId)}
                    type="button"
                  >
                    ACKNOWLEDGE
                  </button>
                )}
                {a.queued && !a.acknowledged && (
                  <span className="alert-queued-tag">IN OFFLINE QUEUE</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
