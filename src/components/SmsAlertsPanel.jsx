// ---------------------------------------------------------------------------
// src/components/SmsAlertsPanel.jsx
//
// Third column of the ADMIN OFFICE SERVER dashboard — the EB-Admin SMS alerts.
//
// Shows:
//   * the active alert mode (Simulation / Real SMS) and the admin number
//     (masked — full numbers are never rendered),
//   * the most recent SMS body exactly as it would be sent, with an honest
//     "SIMULATED SMS — Not actually sent." label whenever it was not sent,
//   * a compact alert history (meter, time, delivery status),
//   * a safe "SEND TEST ALERT" button (no real theft / no hardware needed).
//
// Real-world analogue: the EB admin console that receives & reviews SMS alerts.
// ---------------------------------------------------------------------------

import { ALERT_MODES, SIMULATION_NOTICE, maskPhone } from '../logic/smsAlerts';

export default function SmsAlertsPanel({
  alerts = [],
  mode = ALERT_MODES.SIMULATION,
  adminNumber = '',
  canSync = false,
  syncing = false,
  onTestAlert,
  onClearAlerts,
  onSyncAlerts,
}) {
  const latest = alerts[0] || null;
  const isSimulation = mode !== ALERT_MODES.REAL_SMS;

  return (
    <div className="alerts-column">
      <div className="column-title">EB ADMIN — SMS ALERTS</div>

      <div className="alerts-meta">
        <span className={`mode-badge ${isSimulation ? 'mode-sim' : 'mode-real'}`}>
          {isSimulation ? 'SIMULATION' : 'REAL SMS'}
        </span>
        <span className="alerts-admin">SMS to: {maskPhone(adminNumber)}</span>
      </div>

      {latest ? (
        <div className={`sms-card${latest.test ? ' sms-card--test' : ''}`}>
          <div className="sms-card-head">
            <span className="sms-meter">{latest.meterId}</span>
            <span className="sms-status">{latest.smsStatus}</span>
          </div>

          <pre className="sms-bubble">{latest.message}</pre>

          {isSimulation && <div className="sms-notice">{SIMULATION_NOTICE}</div>}

          {latest.providerResponse != null && (
            <div className="sms-provider">
              Provider: {typeof latest.providerResponse === 'string'
                ? latest.providerResponse
                : JSON.stringify(latest.providerResponse)}
            </div>
          )}
        </div>
      ) : (
        <div className="trace-empty">
          No SMS alerts yet.
          <br />
          Alerts fire only on a failed chip handshake.
        </div>
      )}

      <div className="alerts-actions">
        <button className="test-alert-btn" onClick={onTestAlert} type="button">
          📨 SEND TEST ALERT
        </button>
        <button
          className="clear-alert-btn"
          onClick={onClearAlerts}
          disabled={alerts.length === 0}
          type="button"
        >
          CLEAR
        </button>
      </div>

      {canSync && (
        <button
          className="sync-alert-btn"
          onClick={onSyncAlerts}
          disabled={syncing}
          type="button"
        >
          {syncing ? '⏳ SYNCING…' : '⟳ SYNC FROM BACKEND'}
        </button>
      )}

      <div className="alerts-history-title">
        ALERT HISTORY ({alerts.length})
      </div>
      <div className="alerts-history">
        {alerts.length === 0 && <div className="alerts-history-empty">—</div>}
        {alerts.map((a) => (
          <div className="alerts-history-row" key={a.eventId}>
            <span className="ah-meter">{a.meterId}</span>
            <span className="ah-time">{a.eventTime}</span>
            <span className={`ah-status${a.smsStatus === 'Failed' ? ' ah-status--fail' : ''}`}>
              {a.smsStatus}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
