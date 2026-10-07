import { expect, test } from '@playwright/test';
import { journeyIntelligence } from '../src/lib/journey/journey-intelligence';
import type { JourneyStop } from '../src/lib/journey/types';

const stop = (index: number, fields: Partial<JourneyStop> = {}): JourneyStop => ({ id: `stop-${index}`, sequence: index, name: `Place ${index}`, description: '', latitude: 0, longitude: index / 100, photo: null, rating: null, dayNumber: 1, ...fields });
const calculate = (stops: JourneyStop[]) => journeyIntelligence({ stops });

test('valid stops, empty lists and missing or sparse day assignments', () => {
  expect(calculate([])).toMatchObject({ stopCount: 0, dayCount: null, journeyPace: null, geographicSpanMeters: null });
  expect(calculate([stop(1)])).toMatchObject({ stopCount: 1, dayCount: 1, journeyPace: 'Relaxed', geographicSpanMeters: null });
  expect(calculate([stop(1, { sequence: 0 }), stop(2)]).stopCount).toBe(2);
  expect(calculate([stop(1), stop(2, { dayNumber: 5 }), stop(3, { dayNumber: 5 })])).toMatchObject({ dayCount: 2, averageStopsPerDay: 1.5 });
  for (const dayNumber of [null, NaN, 0, -1, 1.5]) expect(calculate([stop(1), stop(2, { dayNumber })])).toMatchObject({ dayCount: null, journeyPace: null });
  expect(calculate([stop(1), stop(1), stop(2, { name: ' ' }), stop(3, { sequence: NaN }), null as unknown as JourneyStop, stop(4, { id: 'undefined' })]).stopCount).toBe(1);
});

test('existing demo stops keep their zero-based ordering and omit invented days or photos', async ({ page }) => {
  await page.goto('/journey/demo-goa-couple');
  const snapshot = page.getByRole('region', { name: 'Journey snapshot' });
  await expect(snapshot).toContainText('4 stops');
  await expect(snapshot).not.toContainText('active days');
  await expect(snapshot).not.toContainText('pace');
  await expect(snapshot).not.toContainText('Photo-rich');
});

test('conservative pace boundaries use populated days, not declared duration', () => {
  for (const [count, pace] of [[1, 'Relaxed'], [2, 'Relaxed'], [3, 'Balanced'], [4, 'Balanced'], [5, 'Packed']] as const)
    expect(calculate(Array.from({ length: count }, (_, i) => stop(i + 1))).journeyPace).toBe(pace);
  expect(calculate([stop(1), stop(2, { dayNumber: 9 }), stop(3, { dayNumber: 9 }), stop(4, { dayNumber: 9 })]).journeyPace).toBe('Relaxed');
});

test('geographic span handles nearby, regional, wide, antimeridian and invalid coordinates', () => {
  for (const [longitude, scale] of [[0.02, 'Compact'], [1, 'Regional'], [10, 'Wide-ranging']] as const)
    expect(calculate([stop(1, { longitude: 0 }), stop(2, { longitude })]).journeyScale).toBe(scale);
  expect(calculate([stop(1, { longitude: 179.99 }), stop(2, { longitude: -179.99 })]).journeyScale).toBe('Compact');
  for (const longitude of [null, NaN, Infinity, 181]) expect(calculate([stop(1), stop(2, { longitude })]).geographicSpanMeters).toBeNull();
  expect(calculate([stop(1), stop(2, { latitude: 91 })]).journeyScale).toBeNull();
  expect(calculate(Array.from({ length: 201 }, (_, i) => stop(i + 1))).journeyScale).toBeNull();
});

test('content coverage has useful labels, no public score and no invalid ratings', () => {
  const stops = [stop(1), stop(2), stop(3), stop(4)];
  expect(calculate(stops)).toMatchObject({ contentCompleteness: 'minimal', contentSignals: [] });
  expect(calculate([stop(1, { photo: '/images/goa.jpg' }), ...stops.slice(1)])).toMatchObject({ contentCompleteness: 'standard', contentSignals: [] });
  const rich = stops.map(s => ({ ...s, photo: '/images/goa.jpg', description: 'An experience.', rating: 4 }));
  expect(calculate(rich)).toMatchObject({ contentCompleteness: 'rich', contentSignals: ['Photo-rich', 'Detailed stops'] });
  for (const rating of [NaN, Infinity, -1, 6]) expect(calculate([stop(1, { rating })]).contentCompleteness).toBe('minimal');
  expect(calculate([stop(1, { rating: 0 })]).contentCompleteness).toBe('standard');
  expect(journeyIntelligence({ stops, travelerType: 'couple' }).travelerStyle).toBe('couple');
});

test('private actual tracks never become public snapshot data, even if supplied accidentally', () => {
  for (const track of [null, { points: [] }, { points: [[73, 15, 1000, 10, 0], [73.001, 15, 2000, 10, 0]] }, { points: [[NaN, Infinity]] }]) {
    const input = { stops: [stop(1)], track, privateNote: 'secret', actualDistance: 9999 };
    expect(journeyIntelligence(input)).toEqual(calculate(input.stops));
    expect(JSON.stringify(journeyIntelligence(input))).not.toContain('secret');
    expect(journeyIntelligence(input)).not.toHaveProperty('actualDistance');
  }
});
