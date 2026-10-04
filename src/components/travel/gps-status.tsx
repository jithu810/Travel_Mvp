import type { LocationFix } from '@/lib/travel/location';
import type { LocationStatus } from '@/lib/travel/location-watch';
import type { TravelStatus } from '@/lib/travel/session';

const messages: Record<LocationStatus, string> = {
  NOT_REQUESTED: 'Location permission has not been requested.',
  REQUESTING: 'Waiting for a precise location… Allow location access if your browser asks.',
  AVAILABLE: 'GPS active · you are here.',
  INACCURATE: 'GPS accuracy is too low. Navigation and automatic arrivals will update when the signal improves.',
  DENIED: 'Location access is unavailable. You can continue this journey manually. To use GPS, allow location for this site in your browser settings.',
  UNSUPPORTED: 'This browser does not support location access. Continue manually.',
  INSECURE: 'GPS requires HTTPS or localhost. Location is unavailable on this connection; continue manually.',
  UNAVAILABLE: 'Location is temporarily unavailable. Continue manually while waiting, or retry GPS.',
  TIMEOUT: 'The location request timed out. Continue manually while waiting, or retry GPS.',
  INVALID: 'A precise location is unavailable. Waiting for a better reading; you can continue manually.',
  STALE: 'GPS signal lost. Waiting for a fresh location; navigation and automatic arrivals are on hold.',
};

export function GpsStatus({ status, fix, travelStatus, retry, trackPrivacy = false, hideRetry = false }: { status: LocationStatus; fix: LocationFix | null; travelStatus: TravelStatus; retry: () => void; trackPrivacy?: boolean; hideRetry?: boolean }) {
  const active = travelStatus === 'ACTIVE';
  const message = travelStatus === 'PAUSED' ? 'GPS paused. No stops will complete automatically until you resume.' : ['COMPLETED', 'CANCELLED'].includes(travelStatus) ? 'GPS stopped.' : !active ? messages.NOT_REQUESTED : messages[status];
  return <section aria-label="GPS status" className="space-y-3 rounded-2xl bg-[#e7eedf]/60 p-4">
    <p role="status" data-testid="gps-status" data-status={active ? status : travelStatus === 'NOT_STARTED' ? 'NOT_REQUESTED' : 'STOPPED'} className="text-sm font-semibold leading-6 text-brand">{message}{fix ? ` Accuracy: ±${Math.round(fix.accuracy)} m.` : ''}</p>
    {!hideRetry && active && ['DENIED', 'UNAVAILABLE', 'TIMEOUT', 'INVALID', 'STALE'].includes(status) && <button type="button" onClick={retry} className="min-h-11 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-brand">{status === 'DENIED' ? 'Check location permission' : 'Retry GPS'}</button>}
    <details className="text-xs leading-6 text-stone-600"><summary className="min-h-11 cursor-pointer font-semibold">Location privacy and browser limits</summary><p>{trackPrivacy ? 'Accepted GPS points form your private travelled track. Signed-in trips use a bounded local recovery buffer and private account storage; anonymous trips stay in memory. Tracks are not shared with other travelers. ' : 'Your current position and route are held in memory. Location is not saved to your account or shared with other travelers. '}Mapbox receives your current location and next stop to calculate road directions. Browser permission is required. Keep this page open: background tabs and locked screens may suspend updates. Continuous background tracking is not guaranteed.</p></details>
  </section>;
}
