// ---------------------------------------------------------------------------
// src/App.jsx
//
// Root component.  Owns the shared state (logs + last captured theft) and the
// 4-quadrant layout described in the spec:
//
//   +--------------------------------------------------+
//   |                 ADMIN SERVER (top 50%)           |
//   +---------------------------+----------------------+
//   | AUTHORISED METER (25%)    | THIEF PANEL (25%)    |
//   +---------------------------+----------------------+
//
// Callbacks (`onVerify`, `onTheftAttempt`) are passed down; children never
// mutate each other's state directly.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from 'react';
import AdminServer from './components/AdminServer';
import AuthorisedMeter from './components/AuthorisedMeter';
import ThiefPanel from './components/ThiefPanel';
import { verifyCode } from './logic/verification';
import { generateWifiTrace } from './logic/wifiTrace';
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
  // Every click produces a NEW thief trace with fresh random details.
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
    },
    [pushLog]
  );

  // ---- share captured location -----------------------------------------
  const handleShareLocation = useCallback(() => {
    if (!lastTheft) return;

    const report =
      `SMART-GRID THEFT TRACE REPORT\n` +
      `Timestamp: ${lastTheft.timestampLocal}\n` +
      `SSID: ${lastTheft.ssid}\n` +
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
    <div className="app">
      {/* ---------------- TOP HALF: Admin Server ---------------- */}
      <AdminServer
        logs={logs}
        lastTheft={lastTheft}
        onShareLocation={handleShareLocation}
      />

      {/* ---------------- BOTTOM HALF: Meter + Thief ---------------- */}
      <div className="bottom-half">
        <AuthorisedMeter meter={AUTHORISED_METER} onVerify={handleAuthorisedVerify} />
        <ThiefPanel onTheftAttempt={handleThiefAttempt} />
      </div>

      {/* ---------------- Toast notification ---------------- */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
