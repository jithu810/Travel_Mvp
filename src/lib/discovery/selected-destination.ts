import type { MapboxFeature } from '@/lib/mapbox/geocoding';
import { getDestination } from './destinations';

export const destinationSearchTypes = 'country,region,district,place,locality,neighborhood';
export type SelectedDestination = {
  name: string; label: string; mapboxId: string; latitude: number; longitude: number; type: string;
  country?: string; region?: string; place?: string; bbox?: [number, number, number, number];
};

function text(value: unknown, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : undefined;
}

function bounds(value: unknown): SelectedDestination['bbox'] {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(item => typeof item === 'number' && Number.isFinite(item))) return;
  const [west, south, east, north] = value;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west > east || south > north) return;
  return [west, south, east, north];
}

export function destinationFromFeature(feature: MapboxFeature): SelectedDestination | null {
  const properties = feature.properties;
  const name = text(properties?.name_preferred || properties?.name);
  const mapboxId = text(properties?.mapbox_id || feature.id, 500);
  const [longitude, latitude] = feature.geometry?.coordinates || [];
  const type = properties?.feature_type || 'place';
  if (!name || !mapboxId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !destinationSearchTypes.split(',').includes(type)) return null;
  const context = properties?.context;
  const country = text(context?.country?.name);
  const region = text(context?.region?.name);
  const place = text(context?.place?.name);
  const label = text(properties?.full_address, 1000) || [name, text(properties?.place_formatted, 800) || [place, region, country].filter(value => value && value !== name).join(', ')].filter(Boolean).join(', ');
  return { name, label, mapboxId, latitude, longitude, type, country, region, place, bbox: bounds(properties?.bbox || feature.bbox) };
}

export function destinationParams(destination: SelectedDestination) {
  const params = new URLSearchParams({ destination: destination.name, label: destination.label, mapbox: destination.mapboxId, lat: String(destination.latitude), lng: String(destination.longitude), type: destination.type });
  for (const key of ['country', 'region', 'place'] as const) if (destination[key]) params.set(key, destination[key]);
  if (destination.bbox) params.set('bbox', destination.bbox.join(','));
  return params;
}

export function destinationHref(destination: SelectedDestination) { return `/explore?${destinationParams(destination)}`; }

export function parseSelectedDestination(params: Record<string, string | string[] | undefined>): SelectedDestination | null {
  const name = text(params.destination), label = text(params.label, 1000), mapboxId = text(params.mapbox, 500);
  if (!name || !label || !mapboxId || typeof params.lat !== 'string' || !params.lat.trim() || typeof params.lng !== 'string' || !params.lng.trim()) return null;
  const latitude = Number(params.lat), longitude = Number(params.lng);
  const type = text(params.type);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !type || !destinationSearchTypes.split(',').includes(type)) return null;
  const bbox = typeof params.bbox === 'string' ? bounds(params.bbox.split(',').map(Number)) : undefined;
  return { name, label, mapboxId, latitude, longitude, type, bbox, country: text(params.country), region: text(params.region), place: text(params.place) };
}

const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en');

export function matchesDestination(selected: SelectedDestination, candidate: { destination_slug: string | null; destination_name: string | null; destination_latitude: number | null; destination_longitude: number | null }) {
  const known = getDestination(candidate.destination_slug || '');
  const latitude = candidate.destination_latitude ?? known?.latitude;
  const longitude = candidate.destination_longitude ?? known?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  // Existing catalog context prevents a regional bounding box spilling into
  // an adjacent known region (for example Kerala's box also covers Thenkasi).
  if (selected.type === 'region' && known && normalize(candidate.destination_name || known.name) !== normalize(selected.name) && !normalize(known.region).includes(normalize(selected.name))) return false;
  if (selected.bbox) {
    const [west, south, east, north] = selected.bbox;
    return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
  }
  // Point-only results match nearby destination centers, never name alone.
  const radians = Math.PI / 180;
  const dLat = (latitude - selected.latitude) * radians, dLng = (longitude - selected.longitude) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * radians) * Math.cos(selected.latitude * radians) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a))) <= 25;
}
