// ---------------------------------------------------------------------------
// src/hooks/useCountdown.js
//
// A looping countdown hook used by the authorised meter panel.
//
// It counts down one tick per second from `seconds` to 0, fires the provided
// `onZero` callback exactly once per cycle, briefly displays 00:00:00, then
// automatically resets to `seconds` and loops forever — no user input needed.
//
// In firmware terms this is the periodic wake-up timer of the meter chip:
// every N seconds it wakes, transmits its verification code, then sleeps.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

export function useCountdown(seconds, onZero) {
  const [remaining, setRemaining] = useState(seconds);

  // Keep the latest callback in a ref so the ticking interval never needs to
  // be torn down and recreated when the parent passes a new function.
  const onZeroRef = useRef(onZero);
  useEffect(() => {
    onZeroRef.current = onZero;
  }, [onZero]);

  // The heartbeat: decrement once per second, clamped at zero.
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // When we reach zero: fire the callback, hold on 00:00:00 for a beat, then
  // reset for the next cycle.
  useEffect(() => {
    if (remaining !== 0) return undefined;

    if (typeof onZeroRef.current === 'function') {
      onZeroRef.current();
    }

    const id = setTimeout(() => setRemaining(seconds), 1000);
    return () => clearTimeout(id);
  }, [remaining, seconds]);

  return remaining;
}

export default useCountdown;
