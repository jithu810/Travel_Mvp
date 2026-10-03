import { expect, test } from '@playwright/test';
import { destinationFromFeature, destinationHref, parseSelectedDestination, matchesDestination } from '../src/lib/discovery/selected-destination';

const goa = { id: 'mapbox-goa', geometry: { coordinates: [74.05, 15.32] }, properties: { name: 'Goa', full_address: 'Goa, India', feature_type: 'region', bbox: [73.6, 14.85, 74.34, 15.8], context: { country: { name: 'India' }, region: { name: 'Goa' } } } };

test('destination selection retains real geographic fields and rejects invalid URL state', () => {
  const selected = destinationFromFeature(goa)!;
  const url = new URL(destinationHref(selected), 'https://journey.example');
  expect(parseSelectedDestination(Object.fromEntries(url.searchParams))).toEqual(selected);
  for (const patch of [{ lat: '' }, { lat: 'Infinity' }, { lng: '190' }, { lat: ['15', '99'] }, { type: 'address' }, { mapbox: '' }]) {
    expect(parseSelectedDestination({ ...Object.fromEntries(url.searchParams), ...patch })).toBeNull();
  }
  expect(destinationFromFeature({ ...goa, geometry: { coordinates: [181, 15] } })).toBeNull();
});

test('same-name foreign places do not match India and regional bounds respect known region context', () => {
  const candidate = (slug: string) => ({ destination_slug: slug, destination_name: null, destination_latitude: null, destination_longitude: null });
  const selected = destinationFromFeature(goa)!;
  expect(matchesDestination(selected, candidate('goa'))).toBe(true);
  expect(matchesDestination({ ...selected, latitude: 13.7, longitude: 123.5, bbox: [123, 13, 124, 14] }, candidate('goa'))).toBe(false);
  const kerala = { ...selected, name: 'Kerala', bbox: [74.77, 8.21, 77.42, 12.8] as [number, number, number, number] };
  for (const slug of ['varkala', 'munnar', 'kochi']) expect(matchesDestination(kerala, candidate(slug))).toBe(true);
  expect(matchesDestination(kerala, candidate('thenkasi'))).toBe(false);
  expect(matchesDestination({ ...selected, name: 'Varkala', type: 'place', latitude: 8.74, longitude: 76.72, bbox: undefined }, candidate('varkala'))).toBe(true);
});
