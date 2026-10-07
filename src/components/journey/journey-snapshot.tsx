import type { JourneyIntelligence } from '@/lib/journey/journey-intelligence';
import { formatDistance } from '@/lib/travel/location';

export function JourneySnapshot({ intelligence: value }: { intelligence: JourneyIntelligence }) {
  if (!value.stopCount) return null;
  // At most three contextual signals; no creator grading or numerical scores.
  const signals = [value.journeyScale ? `${value.journeyScale} journey` : null, ...value.contentSignals].filter(Boolean).slice(0, 3);
  return <section aria-labelledby="journey-snapshot" className="min-w-0 space-y-2 break-words">
    <h2 id="journey-snapshot" className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">Journey snapshot</h2>
    <p className="text-sm font-semibold leading-6 text-brand">
      {value.stopCount} {value.stopCount === 1 ? 'stop' : 'stops'}
      {value.dayCount !== null && <> · {value.dayCount} active {value.dayCount === 1 ? 'day' : 'days'}</>}
      {value.journeyPace && <> · {value.journeyPace} pace</>}
    </p>
    {value.averageStopsPerDay !== null && <p className="text-xs leading-5 text-stone-600">About {Math.round(value.averageStopsPerDay)} stops/day. Pace reflects stop count, not time spent.</p>}
    {!!signals.length && <p className="text-sm leading-6 text-stone-600">{signals.join(' · ')}</p>}
    {value.geographicSpanMeters !== null && <p className="text-xs leading-5 text-stone-500">Approx. {formatDistance(value.geographicSpanMeters)} between the furthest stops in a straight line. Road distance may differ.</p>}
  </section>;
}
