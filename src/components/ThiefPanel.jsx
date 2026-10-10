// ---------------------------------------------------------------------------
// src/components/ThiefPanel.jsx
//
// BOTTOM-RIGHT panel — the UNAUTHORISED "thief chip".
//
// A thief taps power and tries to fake a valid chip code.  The "VERIFY"
// button sends a code that is GUARANTEED to fail verification (either a
// malformed/unknown code, or a spoofed code with a bad checksum / unregistered
// meter).  Every click generates a fresh fake identity so it looks like a new
// theft attempt to the Admin Server.
//
// Real-world analogue: the rogue device / tampered meter firmware.
// ---------------------------------------------------------------------------

import { useCallback, useState } from 'react';
import { TRANSFORMERS } from '../logic/constants';

/** Random upper-case hex string of `len` characters. */
function randHex(len) {
  let out = '';
  const chars = '0123456789ABCDEF';
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

/** Uniformly pick one element from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build a thief code.  Both branches are designed so that verifyCode() in
 * src/logic/verification.js ALWAYS returns FAILED:
 *   1. A malformed / unknown code with no registered transformer.
 *   2. A spoofed code under a real transformer prefix but with an unregistered
 *      meter id and a wrong checksum.
 */
function buildThiefCode() {
  if (Math.random() < 0.5) {
    return { code: 'UNKNOWN-XXXX-0000', strategy: 'malformed / unknown chip' };
  }
  const transformer = pick(TRANSFORMERS);
  const fakeMeter = `MTR-${randHex(4)}`;
  const wrongChecksum = randHex(4);
  return {
    code: `${transformer.prefix}-${fakeMeter}-${wrongChecksum}`,
    strategy: `spoofed code under ${transformer.prefix}`,
  };
}

export default function ThiefPanel({ onTheftAttempt }) {
  // The thief's fake chip id (random per mount, i.e. per session).
  const [fakeChipId] = useState(() => `UNAUTH-${randHex(6)}`);
  const [attempts, setAttempts] = useState(0);
  const [theftDetected, setTheftDetected] = useState(false);
  const [status, setStatus] = useState('Standby — no handshake sent.');

  const handleVerify = useCallback(() => {
    const { code, strategy } = buildThiefCode();
    // Report the attempt up to App, which logs it on the Admin Server and
    // captures the thief's Wi-Fi trace.
    onTheftAttempt(code, strategy);

    setAttempts((a) => a + 1);
    setTheftDetected(true);
    setStatus(`Handshake REJECTED (${strategy}). Trace captured.`);
  }, [onTheftAttempt]);

  return (
    <section className="panel bottom-right thief-panel">
      <header className="panel-header">
        <span className="status-dot dot-red" />
        <h2 className="panel-title">UNAUTHORISED THIEF CHIP</h2>
        <span className="header-sub">rogue node</span>
      </header>

      <div className="thief-body">
        <div className="thief-meta">
          <div className="meta-row">
            <span className="meta-label">Fake chip ID</span>
            <span className="meta-value mono">{fakeChipId}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Attempts</span>
            <span className="meta-value">{attempts}</span>
          </div>
        </div>

        <button className="verify-btn" onClick={handleVerify}>
          ⚡ VERIFY (FAKE CODE)
        </button>

        <div className="thief-status">{status}</div>

        {theftDetected && (
          <div className="theft-banner">⚠ THEFT DETECTED — LOCATION TRACED</div>
        )}
      </div>
    </section>
  );
}
