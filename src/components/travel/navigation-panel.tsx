'use client';
import { hasCoordinates } from '@/lib/journey/map-data';
import { formatDistance, freshLocation, MAX_ARRIVAL_ACCURACY_METERS, type LocationFix } from '@/lib/travel/location';
import { formatDuration, nextManeuver, type NavigationDestination, type NavigationState } from '@/lib/travel/navigation';
import type { LocationStatus } from '@/lib/travel/location-watch';
import type { TravelStatus } from '@/lib/travel/session';

type Props = { navigation: NavigationState; destination: NavigationDestination | undefined; status: TravelStatus; fix: LocationFix | null; gpsStatus: LocationStatus; retry: () => void; transportation?: 'driving' | 'walking'; compact?: boolean };

// A visual cue for the provider's existing instruction; never infer a new maneuver.
export function maneuverIcon(instruction: string, type: string) {
  if (type === 'arrive') return '◎';
  const direction = instruction.split(/\s(?:onto|on|towards?)\s/i)[0];
  if (/u-turn/i.test(direction)) return '↶';
  if (/roundabout|rotary/.test(type)) return '⟳';
  if (/\bleft\b/i.test(direction)) return '↰';
  if (/\bright\b/i.test(direction)) return '↱';
  return /depart|continue|straight/.test(type) || /straight|head /i.test(direction) ? '↑' : '◇';
}

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
  if (props.compact) return <section aria-label="Road navigation" data-testid="road-navigation" data-status={navigation.status} className="navigation-compact relative rounded-2xl border border-blue-100 bg-white/95 shadow-sm">
    <div className="px-3 py-2">
      {maneuver ? <div data-testid="next-maneuver" className="flex items-center gap-2 pr-8">
        <span aria-hidden="true" className="shrink-0 text-3xl font-bold text-brand">{maneuverIcon(maneuver.instruction, maneuver.type)}</span>
        <div className="min-w-0"><p className="text-lg font-bold leading-6">{formatDistance(maneuver.distance)}</p><p className="line-clamp-2 break-words text-sm font-semibold leading-5" title={maneuver.instruction}>{maneuver.instruction}</p></div>
      </div> : <p className="pr-8 text-sm font-semibold leading-5 text-brand">{message}</p>}
      <p className="mt-1 truncate text-xs text-stone-600">Next · <span data-testid="navigation-next-stop" title={destination?.name}>{status === 'COMPLETED' ? 'All stops complete' : status === 'CANCELLED' ? 'Session ended' : destination?.name || 'No next stop'}</span></p>
      {route && <p className="mt-1 text-xs font-semibold text-brand"><span data-testid="road-distance" aria-label="Road distance">{formatDistance(route.distance)}</span>{route.duration !== null && <> · <span data-testid="road-duration" aria-label={props.transportation === 'walking' ? 'Estimated walk' : 'Estimated drive'}>{formatDuration(route.duration)}</span> <span className="font-normal">{props.transportation === 'walking' ? 'walk' : 'drive'}</span></>}</p>}
      <p role="status" data-testid="navigation-status" className={!maneuver || message === 'Follow the route' ? 'sr-only' : 'mt-1 text-xs font-semibold text-blue-800'}>{message}</p>
      {navigation.notice && <p role="status" data-testid="navigation-notice" className="mt-1 text-xs font-semibold text-brand">{navigation.notice}</p>}
      {navigation.warning && <p role="status" className="mt-1 text-xs leading-4 text-amber-900">{navigation.warning}</p>}
      {status === 'ACTIVE' && destination && hasCoordinates(destination) && navigation.status === 'unavailable' && <button type="button" onClick={retry} className="min-h-11 text-xs font-semibold text-brand underline">Retry route</button>}
    </div>
    <details className="navigation-hud-details" onKeyDown={event => { if (event.key === 'Escape' && event.currentTarget.open) { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
      <summary aria-label="Navigation details" title="Navigation details" className="absolute right-0 top-0 flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-xl text-lg font-bold text-brand">···</summary>
      <div className="navigation-hud-popover rounded-2xl border border-blue-100 bg-white p-3 text-sm shadow-lg">
        <p className="break-words font-semibold">Next · {destination?.name || 'No next stop'}</p>
        {maneuver && <p className="mt-2 break-words">{maneuver.instruction} · In about {formatDistance(maneuver.distance)}</p>}
        <p className="mt-2">{message}</p>
        {route && <p className="mt-2">Road distance: {formatDistance(route.distance)}{route.duration !== null && <> · {props.transportation === 'walking' ? 'Estimated walk' : 'Estimated drive'}: {formatDuration(route.duration)}</>}</p>}
        <p className="mt-2 text-xs leading-5 text-stone-600">Last route calculation, not a live ETA or traffic estimate. Live guidance is hidden when GPS matching is uncertain. Follow road signs.</p>
        {navigation.routeStale && <p className="mt-2 text-amber-900">The displayed road route is out of date. Retry when you can, or complete stops manually.</p>}
        {navigation.warning && <p className="mt-2 text-amber-900">{navigation.warning}{route ? ' Showing the last valid route for this stop.' : ''}</p>}
        {!!route?.steps.length && <><h3 className="mt-3 font-semibold">Route steps</h3><ol className="mt-2 space-y-3">{route.steps.map((step, i) => <li key={i} className="break-words">{step.instruction}<span className="block text-xs text-stone-600">{formatDistance(step.distance)} on this step</span></li>)}</ol></>}
      </div>
    </details>
  </section>;
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
