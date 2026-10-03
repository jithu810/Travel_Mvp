import type { SelectedDestination } from './selected-destination';
import { matchesDestination } from './selected-destination';
import type { ExploreJourney, ExploreStop } from './explore-types';

export function storedCoordinates(latitude: unknown, longitude: unknown): [number, number] | null {
  return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null;
}

export function matchesStop(selected: SelectedDestination, stop: { name: string; latitude: number | null; longitude: number | null; mapbox_place_id: string | null }) {
  if (stop.mapbox_place_id && stop.mapbox_place_id === selected.mapboxId) return true;
  if (!storedCoordinates(stop.latitude, stop.longitude)) return false;
  return matchesDestination(selected, { destination_slug: null, destination_name: stop.name, destination_latitude: stop.latitude, destination_longitude: stop.longitude });
}

function distance(a: [number, number], b: [number, number]) {
  const radians = Math.PI / 180;
  const x = Math.sin((b[1] - a[1]) * radians / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin((b[0] - a[0]) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export type ExploreGroup = { key: string; label: string; coordinates: [number, number]; journeys: ExploreJourney[] };
export function groupExploreLocations(journeys: ExploreJourney[], world: boolean, radiusKm = world ? 40 : 1): ExploreGroup[] {
  const groups: ExploreGroup[] = [];
  for (const journey of journeys) {
    const valid = journey.mapStops.filter((stop): stop is ExploreStop & { coordinates: [number, number] } => !!stop.coordinates);
    // One real stop per journey keeps the globe clean; destination views show
    // every valid stop in the creator's order. Destination remains a fallback.
    const points = world ? valid.slice(0, 1) : valid;
    const locations = points.map(stop => ({ name: stop.name, coordinates: stop.coordinates }));
    if ((!world || !locations.length) && journey.coordinates) locations.push({ name: journey.destinationName, coordinates: journey.coordinates });
    for (const location of locations) {
      const existing = groups.find(group => distance(group.coordinates, location.coordinates) <= radiusKm);
      if (existing) {
        if (!existing.journeys.some(item => item.id === journey.id)) existing.journeys.push(journey);
      } else groups.push({ key: location.coordinates.join(','), label: location.name, coordinates: location.coordinates, journeys: [journey] });
    }
  }
  // Existing like counts are factual; equal counts preserve published ordering.
  for (const group of groups) group.journeys.sort((a, b) => b.likes - a.likes);
  return groups;
}
