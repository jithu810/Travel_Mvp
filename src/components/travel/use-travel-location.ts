'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { watchTravelLocation, type LocationState } from '@/lib/travel/location-watch';
import type { LocationFix } from '@/lib/travel/location';

export function useTravelLocation(active: boolean, onFix: (fix: LocationFix) => boolean) {
  const [state, setState] = useState<LocationState>({ status: 'NOT_REQUESTED', fix: null });
  const [attempt, setAttempt] = useState(0);
  const callback = useRef(onFix);
  const stopRef = useRef<(() => void) | null>(null);
  const denied = useRef(false);
  useEffect(() => { callback.current = onFix; }, [onFix]);
  const stop = useCallback(() => { stopRef.current?.(); stopRef.current = null; setState({ status: 'NOT_REQUESTED', fix: null }); }, []);
  useEffect(() => {
    if (!active) return;
    // Deferred setup avoids requesting permission during render and survives Strict Mode replay.
    const timer = setTimeout(() => {
      let geolocation: Geolocation | undefined;
      try { geolocation = navigator.geolocation; } catch { /* Unsupported browser. */ }
      stopRef.current = watchTravelLocation({ secure: window.isSecureContext, geolocation,
        permission: navigator.permissions?.query ? async () => (await navigator.permissions.query({ name: 'geolocation' })).state : undefined,
      }, setState, fix => callback.current(fix), denied);
    }, 0);
    return () => { clearTimeout(timer); stopRef.current?.(); stopRef.current = null; };
  }, [active, attempt]);
  return { ...state, fix: active ? state.fix : null, stop, retry: () => { stop(); setState({ status: 'REQUESTING', fix: null }); setAttempt(value => value + 1); } };
}
