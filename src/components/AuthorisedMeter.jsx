// ---------------------------------------------------------------------------
// src/components/AuthorisedMeter.jsx
//
// BOTTOM-LEFT panel — the AUTHORISED meter chip.
//
// Behaviour:
//   * A countdown starts at 00:00:30 and ticks down every second.
//   * At 00:00:00 it automatically transmits its signed verification code to
//     the Admin Server (via the `onVerify` callback).
//   * On success it displays the "electricity flow secured/continues" message.
//   * The timer resets to 00:00:30 and loops forever with no user input.
//
// Real-world analogue: the ESP32/Arduino firmware inside a legitimate
// consumer electricity meter, waking on a periodic timer to prove its identity.
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from 'react';
import { useCountdown } from '../hooks/useCountdown';
import { generateChecksum } from '../logic/verification';
import { VERIFY_INTERVAL_SECONDS } from '../logic/constants';

/** Format a number of seconds as HH:MM:SS. */
function formatHMS(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

export default function AuthorisedMeter({ meter, onVerify }) {
  // The meter's signed code never changes; memoise it for the component's life.
  // Shape: <TRANSFORMER_PREFIX>-<METER_ID>-<CHECKSUM>
  const code = useMemo(
    () => `${meter.prefix}-${meter.meterId}-${generateChecksum(meter.prefix, meter.meterId)}`,
    [meter]
  );

  const [cycles, setCycles] = useState(0);
  const [secured, setSecured] = useState(false);

  // Fired by the countdown hook once per loop.
  const handleZero = useCallback(() => {
    onVerify(code); // transmit the code to the Admin Server
    setCycles((c) => c + 1);
    setSecured(true);
  }, [code, onVerify]);

  const remaining = useCountdown(VERIFY_INTERVAL_SECONDS, handleZero);

  return (
    <section className="panel bottom-left meter-panel">
      <header className="panel-header">
        <span className="status-dot dot-green" />
        <h2 className="panel-title">AUTHORISED METER</h2>
        <span className="header-sub">chip {meter.meterId}</span>
      </header>

      <div className="meter-body">
        <div className="meter-meta">
          <div className="meta-row">
            <span className="meta-label">Owner</span>
            <span className="meta-value">{meter.owner}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Transformer</span>
            <span className="meta-value">{meter.prefix}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Signed code</span>
            <span className="meta-value mono">{code}</span>
          </div>
        </div>

        <div className="timer-block">
          <div className="timer-label">NEXT AUTO-VERIFICATION IN</div>
          <div className="timer">{formatHMS(remaining)}</div>
          <div className="timer-hint">
            cycles completed: {cycles} • resets automatically
          </div>
        </div>

        <div className={`meter-status ${secured ? 'ok' : 'idle'}`}>
          {secured ? (
            <>
              <div className="status-line">verification done</div>
              <div className="status-line">electricity flow is secured</div>
              <div className="status-line">electricity flow continues</div>
            </>
          ) : (
            <div className="status-line">waiting for first handshake…</div>
          )}
        </div>
      </div>
    </section>
  );
}
