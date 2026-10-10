// ---------------------------------------------------------------------------
// src/components/AdminServer.jsx
//
// TOP HALF of the viewport — the "Admin Office Server" monitor.
//
// Responsibilities:
//   * Render the live verification log (terminal look, auto-scrolling).
//   * On authentication FAILURE, prominently display the captured thief
//     Wi-Fi trace (SSID, BSSID/MAC, local + public IP, geolocation,
//     transformer id, timestamp).
//   * Provide the "SHARE LOCATION" button (enabled once a theft exists).
//
// Real-world analogue: the central cloud/Admin server application + database.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import LogLine from './LogLine';

export default function AdminServer({ logs, lastTheft, onShareLocation }) {
  // Ref to the scrollable log container so we can auto-scroll to the newest
  // line whenever the log array grows.
  const logBoxRef = useRef(null);

  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <section className="panel top-half admin-server">
      <header className="panel-header">
        <span className="status-dot dot-green" />
        <h1 className="panel-title">ADMIN OFFICE SERVER</h1>
        <span className="header-sub">verification &amp; theft-tracing core</span>
      </header>

      <div className="admin-body">
        {/* ---------------- Left: live verification log ---------------- */}
        <div className="log-column">
          <div className="column-title">LIVE VERIFICATION LOG</div>
          <div className="log-box" ref={logBoxRef}>
            {logs.map((log) => (
              <LogLine key={log.id} log={log} />
            ))}
          </div>
        </div>

        {/* ---------------- Right: captured thief trace ---------------- */}
        <div className="trace-column">
          <div className="column-title">
            THIEF TRACE
            {lastTheft && <span className="trace-live">● LIVE CAPTURE</span>}
          </div>

          {lastTheft ? (
            <div className="trace-card">
              <TraceRow label="WiFi SSID" value={lastTheft.ssid} />
              <TraceRow label="BSSID / MAC" value={lastTheft.bssid} />
              <TraceRow label="Local IP" value={lastTheft.localIp} />
              <TraceRow label="Public IP" value={lastTheft.publicIp} />
              <TraceRow
                label="Geolocation"
                value={`${lastTheft.lat}, ${lastTheft.lng}`}
              />
              <TraceRow
                label="City"
                value={`${lastTheft.city}, ${lastTheft.country}`}
              />
              <TraceRow
                label="Transformer"
                value={`${lastTheft.transformerId} (${lastTheft.transformerLabel})`}
                highlight
              />
              <TraceRow label="Timestamp" value={lastTheft.timestampLocal} />
              <TraceRow label="Reject reason" value={lastTheft.reason} />
            </div>
          ) : (
            <div className="trace-empty">
              No theft detected yet.
              <br />
              Awaiting an unauthorised handshake…
            </div>
          )}

          <button
            className="share-btn"
            disabled={!lastTheft}
            onClick={onShareLocation}
          >
            📡 SHARE LOCATION
          </button>
        </div>
      </div>
    </section>
  );
}

/** Small labelled key/value row used inside the trace card. */
function TraceRow({ label, value, highlight }) {
  return (
    <div className={`trace-row${highlight ? ' trace-row--highlight' : ''}`}>
      <span className="trace-label">{label}</span>
      <span className="trace-value">{value}</span>
    </div>
  );
}
