import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

// useIdleSession — client half of the sliding inactivity session.
//
// The server slides `activeSession.expiresAt` forward on every authenticated
// request. This hook covers the gap where the user is clearly ACTIVE
// (typing, reading, moving the mouse) but not firing API calls:
//   1. Tracks real user activity (mouse / keyboard / touch / scroll).
//   2. While active, pings /api/session/ping at most every PING_INTERVAL_MS so
//      the server window keeps sliding.
//   3. At (timeout − 60s) of true inactivity, surfaces a warning with a live
//      countdown; "Stay signed in" resets the clock and pings the server.
//   4. If the countdown lapses, calls onExpired() — the server window has
//      lapsed in parallel, so this is a clean, synchronized logout.
const WARNING_LEAD_MS = 60_000; // show the warning 60s before expiry
const PING_INTERVAL_MS = 120_000; // server keep-alive at most every 2 min
const TICK_MS = 1_000;

interface UseIdleSessionArgs {
  enabled: boolean;
  timeoutMinutes: number | undefined;
  onExpired: () => void;
}

export function useIdleSession({ enabled, timeoutMinutes, onExpired }: UseIdleSessionArgs) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  // Refs start empty and are populated in an effect, never during render —
  // Date.now() and ref writes are both impure/side-effecting, and the React
  // Compiler correctly declines to optimize a component that does either
  // in the render body.
  const lastActivityRef = useRef<number>(0);
  const lastPingRef = useRef<number>(0);
  const expiredRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  const timeoutMs = Math.max(1, Number(timeoutMinutes) || 480) * 60_000;
  // Never let the warning threshold go to/below zero on very short timeouts.
  const warnAtMs = Math.max(
    timeoutMs - WARNING_LEAD_MS,
    Math.min(timeoutMs * 0.5, timeoutMs - 5_000),
  );

  const staySignedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    api
      .sessionPing()
      .then(() => {
        lastPingRef.current = Date.now();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    expiredRef.current = false;
    lastActivityRef.current = Date.now();
    lastPingRef.current = Date.now();

    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'wheel',
    ];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));

    const timer = setInterval(() => {
      if (expiredRef.current) return;
      const now = Date.now();
      const idleMs = now - lastActivityRef.current;

      if (idleMs >= timeoutMs) {
        expiredRef.current = true;
        setShowWarning(false);
        onExpiredRef.current?.();
        return;
      }

      if (idleMs >= warnAtMs) {
        setShowWarning(true);
        setSecondsLeft(Math.max(0, Math.ceil((timeoutMs - idleMs) / 1000)));
      } else {
        setShowWarning(false);
        if (
          now - lastPingRef.current >= PING_INTERVAL_MS &&
          lastActivityRef.current > lastPingRef.current
        ) {
          lastPingRef.current = now;
          api.sessionPing().catch(() => {
            /* a sessionInvalid 401 is handled globally in lib/api.ts */
          });
        }
      }
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, markActive));
    };
  }, [enabled, timeoutMs, warnAtMs]);

  return { showWarning, secondsLeft, staySignedIn };
}
