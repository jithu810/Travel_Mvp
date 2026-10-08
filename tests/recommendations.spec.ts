import { test, expect } from '@playwright/test';
import { recommendJourneys, recommendationWeights as weights, type RecommendationCandidate } from '../src/lib/discovery/recommendations';
import { journeyIntelligence } from '../src/lib/journey/journey-intelligence';
import { hasKnownSimilarParent } from '../src/lib/journey/lineage-similarity';
const now = Date.parse('2026-10-08T12:00:00Z');
function candidate(id: string, options: { creator?: string; destination?: string; traveler?: 'solo' | 'couple'; stops?: number; days?: number; latitude?: number; longitude?: number; likes?: number; published?: string | null; parent?: string | null; key?: string; rich?: boolean } = {}): RecommendationCandidate {
  const count = options.stops || 6, days = options.days || 2, traveler = options.traveler || 'couple';
  const stops = Array.from({ length: count }, (_, i) => ({ id: `${id}-${i}`, name: `Place ${i}`, sequence: i + 1, latitude: options.latitude ?? 15.49, longitude: (options.longitude ?? 73.83) + i / 100,
    dayNumber: i % days + 1, description: options.rich ? 'A memory' : '', photo: options.rich ? '/images/goa.jpg' : null, rating: null }));
  const intelligence = journeyIntelligence({ stops, travelerType: traveler });
  return { journey: { id, title: id, description: '', destinationSlug: options.destination || 'goa', travelerType: traveler, durationDays: days, coverImage: '/images/goa.jpg', creatorId: options.creator || id, creatorName: 'Traveler', creatorAvatar: null, likes: options.likes || 0, isDemo: false, status: 'published', stops: stops.map(s => ({ ...s, position: s.sequence })) },
    features: { id, creatorId: options.creator || id, status: 'published', destinationSlug: options.destination || 'goa', destinationName: options.destination || 'Goa', latitude: options.latitude ?? 15.49, longitude: options.longitude ?? 73.83, durationDays: days, intelligence, publishedAt: options.published === undefined ? '2026-10-08T00:00:00Z' : options.published, copiedFrom: options.parent || null, contentKey: options.key || id } };
}
const score = (c: RecommendationCandidate, saved = [candidate('interest').features]) => recommendJourneys({ candidates: [c], saved, now }).results[0];

test('explicit saved/liked interests outweigh even very popular unrelated journeys', () => {
  const source = candidate('source').features, match = candidate('match');
  const unrelated = candidate('unrelated', { destination: 'tokyo', traveler: 'solo', latitude: 35.6, longitude: 139.7, stops: 20, days: 7, likes: 1000000 });
  for (const signal of ['saved', 'liked'] as const) {
    const ranked = recommendJourneys({ candidates: [unrelated, match], [signal]: [source], now });
    expect(ranked.results[0].journey.id).toBe('match'); expect(ranked.personalized).toBe(true);
    expect(ranked.results[0].reasons).toContain(`Similar to journeys you ${signal}`);
  }
  expect(score(match).score - score(match, []).score).toBeGreaterThan(weights.popularity + weights.freshness);
});

test('each destination, style, duration, pace, stop, scale and content match has a supported reason', () => {
  const matched = score(candidate('match', { rich: true }), [candidate('source', { rich: true }).features]);
  for (const reason of ['Similar destination', 'Similar travel style', 'Similar trip length', 'Similar pace', 'Similar stop count', 'Similar geographic spread', 'Similar photo-rich journeys', 'Similar detailed stories']) expect(matched.reasons).toContain(reason);
  const distant = score(candidate('distant', { destination: 'worldwide', latitude: 40, longitude: -70, traveler: 'solo', stops: 30, days: 6 }));
  expect(distant.reasons).not.toContain('Similar destination'); expect(distant.reasons).not.toContain('Similar trip length'); expect(distant.reasons).not.toContain('Similar pace');
  expect(score(candidate('nearby', { destination: 'worldwide', latitude: 15.9 })).reasons).toContain('Nearby destination');
  const sparse = candidate('sparse').features; sparse.durationDays = 5;
  expect(score(candidate('two-day'), [sparse]).reasons).not.toContain('Similar trip length');
});

test('repeated and mixed interests are bounded and duplicate save/like evidence is counted once', () => {
  const c = candidate('candidate'); const a = candidate('a').features, b = candidate('b').features;
  const single = recommendJourneys({ candidates: [c], saved: [a], now }).results[0].score;
  expect(recommendJourneys({ candidates: [c], saved: [a], liked: [a], now }).results[0].score).toBe(single);
  expect(recommendJourneys({ candidates: [c], saved: [a, b], now }).results[0].score).toBe(single + weights.repeated);
  expect(recommendJourneys({ candidates: [c], saved: [a], liked: [b], now }).results[0].score).toBeGreaterThan(single);
});

test('anonymous and new-user fallback is deterministic, bounded and honest about freshness/popularity', () => {
  const old = candidate('old', { published: '2020-01-01T00:00:00Z' }), fresh = candidate('fresh'), popular = candidate('popular', { published: null, likes: 50 });
  const input = { candidates: [old, fresh, popular], now };
  const result = recommendJourneys(input);
  expect(result.personalized).toBe(false); expect(result).toEqual(recommendJourneys(input));
  expect(result).toEqual(recommendJourneys({ ...input, viewerId: 'new-user' }));
  expect(score(old, []).reasons).toEqual(['Explore a public journey']);
  expect(score(popular, []).reasons).toEqual(['Liked by travelers']);
  expect(score(candidate('future', { published: '2030-01-01T00:00:00Z' }), []).reasons).not.toContain('Recently published');
  expect(recommendJourneys({ candidates: [], now }).results).toEqual([]);
});

test('anonymous destination and traveler context boosts without changing Explore filtering', () => {
  const goa = candidate('goa'), tokyo = candidate('tokyo', { destination: 'worldwide', latitude: 35, longitude: 139, traveler: 'solo' });
  const result = recommendJourneys({ candidates: [tokyo, goa], now, traveler: 'couple', destination: { name: 'Goa', label: 'Goa, India', mapboxId: 'place.goa', latitude: 15.49, longitude: 73.83, type: 'place' } });
  expect(result.results[0].journey.id).toBe('goa'); expect(result.results[0].reasons).toContain('Near your selected destination');
  expect(result.results[0].reasons).toContain('Matches your selected travel style'); expect(result.personalized).toBe(false);
  const unrelated = candidate('unrelated', { destination: 'worldwide', latitude: 35, longitude: 139, traveler: 'solo', stops: 20, days: 7 }).features;
  expect(recommendJourneys({ candidates: [goa], saved: [unrelated], now, traveler: 'couple' }).personalized).toBe(false);
});

test('creator and destination diversity prevent a single-source feed while preserving relevance', () => {
  const pool = [candidate('a', { creator: 'same' }), candidate('b', { creator: 'same' }), candidate('c', { creator: 'same' }), candidate('d', { creator: 'different', destination: 'kochi', latitude: 9.97, longitude: 76.28 })];
  const results = recommendJourneys({ candidates: pool, now }).results;
  expect(results).toHaveLength(3); expect(results.some(r => r.journey.id === 'd')).toBe(true);
  expect(new Set(results.map(r => r.journey.id)).size).toBe(3);
});

test('draft, inaccessible, own and duplicate candidates are excluded; unseen journeys come before saved ones', () => {
  const draft = candidate('draft'); draft.journey.status = 'draft'; draft.features.status = 'draft';
  const mismatch = candidate('mismatch'); mismatch.features.id = 'inaccessible';
  const own = candidate('owned', { creator: 'viewer' }), saved = candidate('saved'), unseen = candidate('unseen');
  const result = recommendJourneys({ candidates: [draft, mismatch, own, saved, unseen, unseen], saved: [saved.features], viewerId: 'viewer', now });
  expect(result.results.map(r => r.journey.id)).toEqual(['unseen', 'saved']);
  expect(recommendJourneys({ candidates: [unseen], saved: [draft.features], now }).personalized).toBe(false);
});

test('direct unchanged remixes are down-ranked, changed and multi-generation remixes remain eligible', () => {
  const source = candidate('source', { key: 'same' }).features;
  const direct = candidate('direct', { parent: 'source', key: 'same' }), changed = candidate('changed', { parent: 'source', key: 'different' }), later = candidate('later', { parent: 'direct', key: 'same' });
  expect(hasKnownSimilarParent(direct.features, [source])).toBe(true);
  expect(hasKnownSimilarParent(changed.features, [source])).toBe(false);
  expect(hasKnownSimilarParent(later.features, [source])).toBe(false);
  expect(score(changed, [source]).score - score(direct, [source]).score).toBe(weights.knownRemix);
  const ranked = recommendJourneys({ candidates: [direct, changed, later], saved: [source], now });
  expect(ranked.results.map(r => r.journey.id)).toContain('direct'); expect(ranked.results[0].journey.id).not.toBe('direct');
});
