'use client';
import { hasCoordinates } from '@/lib/journey/map-data';
import { formatDistance, MAX_ARRIVAL_ACCURACY_METERS, type LocationFix } from '@/lib/travel/location';
import { formatDuration, nextManeuver, type NavigationDestination, type NavigationState } from '@/lib/travel/navigation';
import type { TravelStatus } from '@/lib/travel/session';

export function NavigationPanel({ navigation, destination, status, fix, retry }: { navigation: NavigationState; destination: NavigationDestination | undefined; status: TravelStatus; fix: LocationFix | null; retry: () => void }) {
  const { route } = navigation;
  const maneuver = route && !navigation.warning ? nextManeuver(route, fix) : null;
  const message = status !== 'ACTIVE' ? status === 'PAUSED' ? 'Navigation paused' : ['COMPLETED', 'CANCELLED'].includes(status) ? 'Navigation stopped' : 'Navigation starts with your journey' : !destination || !hasCoordinates(destination) ? 'Navigation unavailable for this stop.' : !fix ? 'Waiting for GPS' : fix.accuracy > MAX_ARRIVAL_ACCURACY_METERS ? 'GPS accuracy low' : navigation.status === 'calculating' ? 'Calculating route…' : navigation.status === 'active' ? 'Navigation active' : navigation.status === 'unavailable' ? 'Route unavailable' : 'Waiting to calculate route';
  return <section aria-label="Road navigation" data-testid="road-navigation" data-status={navigation.status} className="rounded-2xl border border-blue-100 bg-white p-5 sm:p-6">
    <p role="status" className="text-sm font-semibold text-blue-800">{message}</p>
    {status === 'ACTIVE' && destination && <p className="mt-2 break-words text-lg font-semibold">Road route to {destination.name}</p>}
    {navigation.warning && <p className="mt-3 text-sm leading-6 text-amber-900">{navigation.warning}{route ? ' Showing the last valid route for this stop.' : ''}</p>}
    {route && <><dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3"><div><dt className="text-xs text-stone-500">Road distance</dt><dd data-testid="road-distance" className="mt-1 text-xl font-semibold">{formatDistance(route.distance)}</dd></div>{route.duration !== null && <div><dt className="text-xs text-stone-500">Estimated travel time</dt><dd data-testid="road-duration" className="mt-1 text-xl font-semibold">{formatDuration(route.duration)}</dd></div>}</dl><p className="mt-2 text-xs leading-5 text-stone-500">At the last route calculation · driving estimate without live traffic. These totals are not a live remaining ETA.</p>
      {maneuver && <div data-testid="next-maneuver" className="mt-4 rounded-xl bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-800">Next maneuver · {maneuver.type}</p><p className="mt-1 break-words font-semibold">{maneuver.instruction}</p><p className="mt-1 text-sm text-stone-600">About {formatDistance(maneuver.distance)} along the matched road segment</p></div>}
      {!!route.steps.length && <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand">Mapbox route instructions</summary><ol className="space-y-3">{route.steps.map((step, i) => <li key={i} className="break-words"><span className="text-xs text-stone-500">{step.type} · {formatDistance(step.distance)} on this step</span><p>{step.instruction}</p></li>)}</ol><p className="mt-3 text-xs leading-5 text-stone-500">Live maneuver guidance is hidden when GPS cannot be confidently matched. Follow road signs; browser heading and matching can be inaccurate.</p></details>}
    </>}
    {status === 'ACTIVE' && destination && hasCoordinates(destination) && navigation.status === 'unavailable' && <button type="button" onClick={retry} className="mt-4 min-h-11 rounded-full border border-stone-300 px-5 text-sm font-semibold text-brand">Retry route</button>}
  </section>;
}
