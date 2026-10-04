'use client';
import { hasCoordinates } from '@/lib/journey/map-data';
import { formatDistance, freshLocation, MAX_ARRIVAL_ACCURACY_METERS, type LocationFix } from '@/lib/travel/location';
import { formatDuration, nextManeuver, type NavigationDestination, type NavigationState } from '@/lib/travel/navigation';
import type { LocationStatus } from '@/lib/travel/location-watch';
import type { TravelStatus } from '@/lib/travel/session';

type Props = { navigation: NavigationState; destination: NavigationDestination | undefined; status: TravelStatus; fix: LocationFix | null; gpsStatus: LocationStatus; retry: () => void; transportation?: 'driving' | 'walking'; compact?: boolean };

export function navigationPresentation({ navigation, destination, status, fix, gpsStatus }: Omit<Props, 'retry'>) {
  const { route } = navigation;
  const precise = !!fix && freshLocation(fix) && fix.accuracy <= MAX_ARRIVAL_ACCURACY_METERS;
  const maneuver = status === 'ACTIVE' && precise && route && !navigation.warning && !navigation.routeStale && !navigation.checkingRoute ? nextManeuver(route, fix) : null;
  const gpsUnavailable = ['DENIED', 'UNSUPPORTED', 'INSECURE', 'UNAVAILABLE', 'TIMEOUT', 'INVALID'].includes(gpsStatus);
  const message = status === 'PAUSED' ? 'Navigation paused' : status === 'COMPLETED' ? 'Journey complete' : status === 'CANCELLED' ? 'Journey ended' : status !== 'ACTIVE' ? 'Ready when you are' : !destination || !hasCoordinates(destination) ? 'Navigation unavailable for this stop.' : gpsUnavailable ? 'GPS unavailable · continue manually' : !fix || !freshLocation(fix) ? 'Waiting for GPS…' : !precise ? 'GPS signal weak' : navigation.status === 'unavailable' ? 'Route unavailable' : navigation.status === 'rerouting' ? 'Rerouting…' : navigation.status === 'calculating' ? route ? 'Route updating…' : 'Finding route…' : navigation.checkingRoute ? 'Checking route…' : navigation.routeStale ? 'Waiting to update route…' : navigation.status === 'active' ? 'Follow the route' : 'Finding route…';
  return { message, maneuver };
}

export function NavigationPanel(props: Props) {
  const { navigation, destination, status, retry } = props;
  const { route } = navigation;
  const { message, maneuver } = navigationPresentation(props);
  return <section aria-label="Road navigation" data-testid="road-navigation" data-status={navigation.status} className={`overflow-hidden rounded-2xl border border-blue-100 bg-white/95 shadow-sm ${props.compact ? 'navigation-compact' : ''}`}>
    <div className="border-l-4 border-blue-700 p-4 sm:p-5">
      <p className="text-[11px] font-bold tracking-widest text-stone-600 uppercase">{status === 'COMPLETED' || status === 'CANCELLED' ? 'Travel Mode' : 'Next stop'}</p>
      <h2 data-testid="navigation-next-stop" className="mt-1 break-words text-2xl font-semibold leading-tight sm:text-3xl">{status === 'COMPLETED' ? 'All stops complete' : status === 'CANCELLED' ? 'Session ended' : destination?.name || 'No next stop'}</h2>
      <p role="status" data-testid="navigation-status" className="mt-2 text-sm font-semibold text-blue-800">{message}</p>
      {navigation.notice && <p role="status" data-testid="navigation-notice" className="mt-2 text-sm font-semibold text-brand">{navigation.notice}</p>}
      {route && <><dl className="mt-4 flex flex-wrap gap-x-7 gap-y-2"><div><dt className="text-xs text-stone-600">Road distance</dt><dd data-testid="road-distance" className="mt-1 text-xl font-semibold">{formatDistance(route.distance)}</dd></div>{route.duration !== null && <div><dt className="text-xs text-stone-600">{props.transportation === 'walking' ? 'Estimated walk' : 'Estimated drive'}</dt><dd data-testid="road-duration" className="mt-1 text-xl font-semibold">{formatDuration(route.duration)}</dd></div>}</dl>{!props.compact && <p className="mt-2 text-[11px] leading-5 text-stone-600">Last route calculation · not a live ETA or traffic estimate.</p>}</>}
      {maneuver && <div data-testid="next-maneuver" className="mt-4 border-t border-blue-100 pt-3"><p className="break-words text-lg font-semibold leading-snug">{maneuver.instruction}</p><p className="mt-1 text-xs text-stone-600">In about {formatDistance(maneuver.distance)}{!props.compact && ' along the matched road'}</p></div>}
      {navigation.routeStale && navigation.status !== 'rerouting' && <p className="mt-3 text-sm leading-6 text-amber-900">The displayed road route is out of date. {navigation.status === 'unavailable' ? 'Retry when you can, or complete stops manually.' : 'Waiting to update it.'}</p>}
      {navigation.warning && <p className="mt-3 text-sm leading-6 text-amber-900">{navigation.warning}{route ? ' Showing the last valid route for this stop.' : ''}</p>}
      {status === 'ACTIVE' && destination && hasCoordinates(destination) && navigation.status === 'unavailable' && <button type="button" onClick={retry} className="mt-3 min-h-11 rounded-full border border-stone-300 px-5 text-sm font-semibold text-brand">Retry route</button>}
    </div>
    {!!route?.steps.length && <details className="border-t border-stone-100 px-4 pb-2 text-sm sm:px-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand">{props.compact ? 'Route steps' : 'Mapbox route instructions'}</summary><p className="mb-3 text-xs leading-5 text-stone-600">From the last route calculation. Live guidance is hidden when GPS matching is uncertain. Follow road signs.</p><ol className="space-y-3 pb-3">{route.steps.map((step, i) => <li key={i} className="break-words"><p>{step.instruction}</p><span className="text-xs text-stone-600">{formatDistance(step.distance)} on this step</span></li>)}</ol></details>}
  </section>;
}
