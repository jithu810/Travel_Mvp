import { hasCoordinates, orderedStops } from './map-data';
import type { JourneyStop } from './types';
import { travelerTypes, type TravelerType } from '../discovery/types';
import { distanceMeters } from '../travel/location';

export type JourneyIntelligence = {
  stopCount: number;
  dayCount: number | null;
  averageStopsPerDay: number | null;
  journeyPace: 'Relaxed' | 'Balanced' | 'Packed' | null;
  geographicSpanMeters: number | null;
  journeyScale: 'Compact' | 'Regional' | 'Wide-ranging' | null;
  travelerStyle: TravelerType | null;
  contentCompleteness: 'minimal' | 'standard' | 'rich';
  contentSignals: string[];
};

// Input is the already-authorized Story stop list. Deliberately accepts no GPS
// tracks, sessions or inferred route duration/distance. Public facts only.
export function journeyIntelligence(input: { stops: readonly JourneyStop[]; travelerType?: TravelerType | null }): JourneyIntelligence {
  const seen = new Set<string>();
  const stops = orderedStops(input.stops.filter(stop => {
    if (!stop || typeof stop.id !== 'string' || !stop.id.trim() || ['undefined', 'null'].includes(stop.id)
      || seen.has(stop.id) || typeof stop.name !== 'string' || !stop.name.trim()
      || !Number.isInteger(stop.sequence) || stop.sequence < 0) return false;
    seen.add(stop.id); return true;
  }));
  const dayCounts = new Map<number, number>();
  for (const stop of stops) if (typeof stop.dayNumber === 'number' && Number.isInteger(stop.dayNumber) && stop.dayNumber > 0)
    dayCounts.set(stop.dayNumber, (dayCounts.get(stop.dayNumber) || 0) + 1);
  // Partial assignments cannot reliably describe the whole itinerary's pace.
  const dayCount = stops.length && [...dayCounts.values()].reduce((sum, count) => sum + count, 0) === stops.length ? dayCounts.size : null;
  const averageStopsPerDay = dayCount ? stops.length / dayCount : null;
  const journeyPace = averageStopsPerDay === null ? null : averageStopsPerDay <= 2 ? 'Relaxed' : averageStopsPerDay <= 4 ? 'Balanced' : 'Packed';
  const coordinates = stops.filter(hasCoordinates);
  let geographicSpanMeters: number | null = null;
  // Exact maximum great-circle separation. Omit incomplete geography and
  // unusually large lists rather than inventing a span or doing unbounded work.
  if (coordinates.length >= 2 && coordinates.length === stops.length && coordinates.length <= 200) {
    geographicSpanMeters = 0;
    for (let i = 0; i < coordinates.length; i++) for (let j = i + 1; j < coordinates.length; j++)
      geographicSpanMeters = Math.max(geographicSpanMeters, distanceMeters(coordinates[i], coordinates[j]));
  }
  // UX labels for geographic spread, never road length, travel time or difficulty.
  const journeyScale = geographicSpanMeters === null ? null : geographicSpanMeters <= 25_000 ? 'Compact' : geographicSpanMeters <= 200_000 ? 'Regional' : 'Wide-ranging';
  const photoCount = stops.filter(stop => typeof stop.photo === 'string' && !!stop.photo.trim()).length;
  const descriptionCount = stops.filter(stop => typeof stop.description === 'string' && !!stop.description.trim()).length;
  const ratingCount = stops.filter(stop => typeof stop.rating === 'number' && Number.isFinite(stop.rating) && stop.rating >= 0 && stop.rating <= 5).length;
  // Coverage signals require at least two stops and a majority of the itinerary.
  const photoRich = photoCount >= 2 && photoCount / stops.length >= 0.5;
  const detailed = descriptionCount >= 2 && descriptionCount / stops.length >= 0.5;
  const contentSignals = [...(photoRich ? ['Photo-rich'] : []), ...(detailed ? ['Detailed stops'] : [])];
  const contentCompleteness = photoRich && detailed ? 'rich' : photoCount || descriptionCount || ratingCount ? 'standard' : 'minimal';
  return { stopCount: stops.length, dayCount, averageStopsPerDay, journeyPace, geographicSpanMeters, journeyScale,
    travelerStyle: travelerTypes.includes(input.travelerType as TravelerType) ? input.travelerType! : null, contentCompleteness, contentSignals };
}
