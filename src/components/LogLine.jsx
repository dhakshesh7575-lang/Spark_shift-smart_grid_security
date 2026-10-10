// ---------------------------------------------------------------------------
// src/components/LogLine.jsx
//
// A single row in the Admin Server's terminal log.  Colour-coded by status:
//   VERIFIED -> neon green, FAILED -> neon red, INFO -> muted blue.
// ---------------------------------------------------------------------------

export default function LogLine({ log }) {
  const tone =
    log.status === 'FAILED'
      ? 'log-failed'
      : log.status === 'VERIFIED'
        ? 'log-verified'
        : 'log-info';

  return (
    <div className={`log-line ${tone}`}>
      <span className="log-time">[{log.time}]</span>
      <span className="log-tag">{log.status}</span>
      <span className="log-msg">{log.message}</span>
    </div>
  );
}
