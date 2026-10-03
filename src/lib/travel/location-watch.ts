import { freshLocation, MAX_ARRIVAL_ACCURACY_METERS, MAX_LOCATION_AGE_MS, readLocation, type LocationFix } from './location';

export type LocationStatus = 'NOT_REQUESTED' | 'REQUESTING' | 'AVAILABLE' | 'INACCURATE' | 'DENIED' | 'UNSUPPORTED' | 'INSECURE' | 'UNAVAILABLE' | 'TIMEOUT' | 'INVALID' | 'STALE';
export type LocationState = { status: LocationStatus; fix: LocationFix | null };
type Environment = { secure: boolean; geolocation?: Pick<Geolocation, 'watchPosition' | 'clearWatch'>; permission?: () => Promise<PermissionState> };

// One current fix only. No history, storage, network or analytics dependencies.
export function watchTravelLocation(environment: Environment, onState: (state: LocationState) => void, onFix: (fix: LocationFix) => boolean | void, denied: { current: boolean }) {
  let disposed = false, watch: number | undefined, interval: ReturnType<typeof setInterval> | undefined;
  let latest: LocationFix | null = null, lastTimestamp = -Infinity;
  const startedAt = Date.now();
  const emit = (status: LocationStatus, fix: LocationFix | null = null) => { if (!disposed) { latest = fix; onState({ status, fix }); } };
  const stop = () => { if (disposed) return; disposed = true; if (watch !== undefined) environment.geolocation?.clearWatch(watch); clearInterval(interval); latest = null; };
  async function start() {
    if (!environment.secure) return emit('INSECURE');
    if (!environment.geolocation) return emit('UNSUPPORTED');
    emit('REQUESTING');
    let permission: PermissionState | undefined;
    try { permission = await environment.permission?.(); } catch { /* watchPosition remains the authority when Permissions API is unavailable. */ }
    if (disposed) return;
    if (permission === 'granted') denied.current = false;
    if (permission === 'denied' || denied.current) { denied.current = true; return emit('DENIED'); }
    try {
      watch = environment.geolocation.watchPosition(position => {
        if (disposed) return;
        const fix = readLocation(position);
        if (!fix) return emit('INVALID');
        if (!freshLocation(fix) || fix.timestamp < startedAt) return emit('STALE');
        if (fix.timestamp <= lastTimestamp) return;
        lastTimestamp = fix.timestamp;
        emit(fix.accuracy <= MAX_ARRIVAL_ACCURACY_METERS ? 'AVAILABLE' : 'INACCURATE', fix);
        if (onFix(fix) === false) stop(); // Exactly one candidate stop per new reading; terminal sessions stop immediately.
      }, error => {
        if (disposed) return;
        emit(error.code === 1 ? 'DENIED' : error.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE');
        if (error.code === 1) { denied.current = true; stop(); }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: MAX_LOCATION_AGE_MS });
      // Also covers synchronous test adapters: a terminal callback may stop before watch returns.
      if (disposed) { environment.geolocation.clearWatch(watch); return; }
      interval = setInterval(() => { if (latest && !freshLocation(latest)) emit('STALE'); }, 1000);
    } catch { emit('UNAVAILABLE'); }
  }
  void start();
  return stop;
}
