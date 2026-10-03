import { expect, test } from '@playwright/test';
import { groupExploreLocations, matchesStop, storedCoordinates } from '../src/lib/discovery/explore-geography';
import type { ExploreJourney } from '../src/lib/discovery/explore-types';
import type { SelectedDestination } from '../src/lib/discovery/selected-destination';

const selected: SelectedDestination = { name: 'Thenmala', label: 'Thenmala, Kerala, India', type: 'place', mapboxId: 'thenmala-id', latitude: 8.967814, longitude: 77.07016, bbox: [77.06, 8.96, 77.08, 8.98] };
const journey = (id: string, likes = 0): ExploreJourney => ({ id, title: id, description: '', destinationSlug: 'thenkasi', destinationName: 'Thenkasi', coordinates: [77.308655, 8.955386], travelerType: 'couple', durationDays: 2, coverImage: '/images/goa.jpg', creatorName: 'Fixture', creatorAvatar: null, likes, isDemo: false, stops: [], matchingStops: [], mapStops: [{ id: 'a', name: 'Thenmala', position: 1, coordinates: [77.07016, 8.967814] }, { id: 'b', name: 'Thenmala again', position: 2, coordinates: [77.07017, 8.96782] }, { id: 'c', name: 'Thenkasi', position: 3, coordinates: [77.308655, 8.955386] }, { id: 'invalid', name: 'No location', position: 4, coordinates: null }] });

test('stop matching uses structured identity or geography, never name alone or invalid coordinates', () => {
  expect(matchesStop(selected, { name: 'Thenmala', latitude: 8.967814, longitude: 77.07016, mapbox_place_id: null })).toBe(true);
  expect(matchesStop(selected, { name: 'Thenmala', latitude: 48.85, longitude: 2.35, mapbox_place_id: null })).toBe(false);
  expect(matchesStop(selected, { name: 'Thenmala', latitude: null, longitude: null, mapbox_place_id: null })).toBe(false);
  expect(matchesStop(selected, { name: 'Provider name variant', latitude: null, longitude: null, mapbox_place_id: 'thenmala-id' })).toBe(true);
  for (const [lat, lng] of [[91, 77], [8, Infinity], [NaN, 77], [null, 77]]) expect(storedCoordinates(lat, lng)).toBeNull();
  expect(storedCoordinates(0, 0)).toEqual([0, 0]);
});

test('nearby stops count distinct journeys and keep actual coordinates, with existing likes ordering', () => {
  const a = journey('a'), b = journey('b', 5);
  const groups = groupExploreLocations([a, b], false);
  expect(groups).toHaveLength(2);
  expect(groups[0].coordinates).toEqual(a.mapStops[0].coordinates);
  expect(groups[0].journeys.map(item => item.id)).toEqual(['b', 'a']);
  expect(groups[1].journeys).toHaveLength(2);
  expect(a.mapStops.map(stop => stop.position)).toEqual([1, 2, 3, 4]);
  expect(groupExploreLocations([a, b], true)).toHaveLength(1);
});
