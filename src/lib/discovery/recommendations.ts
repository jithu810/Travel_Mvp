import type { Journey, TravelerFilter } from './types';
import type { JourneyIntelligence } from '../journey/journey-intelligence';
import { hasKnownSimilarParent } from '../journey/lineage-similarity';
import { matchesDestination, type SelectedDestination } from './selected-destination';
import { hasCoordinates } from '../journey/map-data';
import { distanceMeters } from '../travel/location';

export const recommendationWeights = {
  destination: 30, nearby: 15, traveler: 12, days: 6, pace: 5, stops: 4, scale: 3, content: 2,
  saved: 20, liked: 14, repeated: 2, contextTraveler: 20, freshness: 3, popularity: 3,
  knownRemix: 35, creatorDiversity: 18, destinationDiversity: 8, travelerDiversity: 2,
} as const;
export type RecommendationFeatures = {
  id: string; creatorId: string | null; status: 'published' | 'draft'; destinationSlug: string;
  destinationName: string | null; latitude: number | null; longitude: number | null;
  durationDays: number | null; publishedAt: string | null; copiedFrom: string | null; contentKey: string;
  intelligence: JourneyIntelligence;
};
export type RecommendationCandidate = { journey: Journey; features: RecommendationFeatures };
export type RecommendationResult = { journey: Journey; score: number; reasons: string[] };
export type RecommendationInput = {
  candidates: readonly RecommendationCandidate[]; saved?: readonly RecommendationFeatures[]; liked?: readonly RecommendationFeatures[];
  viewerId?: string | null; destination?: SelectedDestination | null; traveler?: TravelerFilter; now: number; limit?: number;
};

function similarity(a: RecommendationFeatures, b: RecommendationFeatures) {
  const w = recommendationWeights;
  let score = 0; const reasons: string[] = [];
  const sameDestination = a.destinationSlug && a.destinationSlug !== 'worldwide' && a.destinationSlug === b.destinationSlug
    || hasCoordinates(a) && hasCoordinates(b) && distanceMeters(a, b) <= 25_000;
  if (sameDestination) { score += w.destination; reasons.push('Similar destination'); }
  else if (hasCoordinates(a) && hasCoordinates(b) && distanceMeters(a, b) <= 150_000) { score += w.nearby; reasons.push('Nearby destination'); }
  if (a.intelligence.travelerStyle && a.intelligence.travelerStyle === b.intelligence.travelerStyle) { score += w.traveler; reasons.push('Similar travel style'); }
  // Match the creator's stated duration first; active stop days can be sparse.
  const daysA = a.durationDays ?? a.intelligence.dayCount, daysB = b.durationDays ?? b.intelligence.dayCount;
  if (daysA && daysB && Math.abs(daysA - daysB) <= 1) { score += w.days; reasons.push('Similar trip length'); }
  if (a.intelligence.journeyPace && a.intelligence.journeyPace === b.intelligence.journeyPace) { score += w.pace; reasons.push('Similar pace'); }
  if (a.intelligence.stopCount && b.intelligence.stopCount && Math.abs(a.intelligence.stopCount - b.intelligence.stopCount) <= 2) { score += w.stops; reasons.push('Similar stop count'); }
  if (a.intelligence.journeyScale && a.intelligence.journeyScale === b.intelligence.journeyScale) { score += w.scale; reasons.push('Similar geographic spread'); }
  for (const signal of a.intelligence.contentSignals) if (b.intelligence.contentSignals.includes(signal)) { score += w.content; reasons.push(signal === 'Photo-rich' ? 'Similar photo-rich journeys' : 'Similar detailed stories'); }
  return { score, reasons };
}

export function recommendJourneys(input: RecommendationInput) {
  const history = (sources: readonly RecommendationFeatures[]) => [...new Map(sources.slice(0, 20).filter(f => f.status === 'published').map(f => [f.id, f])).values()];
  const saved = history(input.saved || []);
  const savedIds = new Set(saved.map(f => f.id));
  const liked = history(input.liked || []).filter(f => !savedIds.has(f.id));
  const known = [...saved, ...liked], knownIds = new Set(known.map(f => f.id));
  const w = recommendationWeights, seen = new Set<string>();
  const scored = input.candidates.slice(0, 100).flatMap(({ journey, features: f }) => {
    if (f.status !== 'published' || journey.status !== 'published' || journey.isDemo || f.id !== journey.id || seen.has(f.id)
      || input.viewerId && (f.creatorId === input.viewerId || journey.creatorId === input.viewerId)) return [];
    seen.add(f.id);
    let score = 0, personalizedRelevance = false; const reasons: string[] = [];
    if (input.destination && matchesDestination(input.destination, { destination_slug: f.destinationSlug, destination_name: f.destinationName, destination_latitude: f.latitude, destination_longitude: f.longitude })) {
      score += w.destination; reasons.push('Near your selected destination');
    }
    if (input.traveler && input.traveler !== 'all' && f.intelligence.travelerStyle === input.traveler) { score += w.contextTraveler; reasons.push('Matches your selected travel style'); }
    for (const [history, weight, reason] of [[saved, w.saved, 'Similar to journeys you saved'], [liked, w.liked, 'Similar to journeys you liked']] as const) {
      const matches = history.map(source => similarity(f, source)).filter(match => match.score >= w.traveler).sort((a, b) => b.score - a.score);
      if (matches.length) { score += weight + matches[0].score + Math.min(8, (matches.length - 1) * w.repeated); reasons.push(reason, ...matches[0].reasons); personalizedRelevance = true; }
    }
    const age = f.publishedAt ? input.now - Date.parse(f.publishedAt) : NaN;
    if (Number.isFinite(age) && age >= 0 && age <= 30 * 86400000) { score += age <= 7 * 86400000 ? w.freshness : 1; reasons.push('Recently published'); }
    if (Number.isFinite(journey.likes) && journey.likes > 0) { score += Math.min(w.popularity, Math.log2(1 + journey.likes)); reasons.push('Liked by travelers'); }
    if (hasKnownSimilarParent(f, known)) score -= w.knownRemix;
    if (!reasons.length) reasons.push('Explore a public journey');
    return [{ journey, features: f, score, reasons: [...new Set(reasons)], personalizedRelevance, known: knownIds.has(f.id) }];
  });
  const results: RecommendationResult[] = [], creators = new Map<string, number>(), destinations = new Map<string, number>(), travelers = new Map<string, number>();
  const limit = Math.max(1, Math.min(6, input.limit || 3));
  let personalized = false;
  while (scored.length && results.length < limit) {
    const adjusted = (c: typeof scored[number]) => c.score - (creators.get(c.features.creatorId || c.journey.id) || 0) * w.creatorDiversity
      - (destinations.get(c.features.destinationName || c.features.destinationSlug) || 0) * w.destinationDiversity
      - (travelers.get(c.journey.travelerType) || 0) * w.travelerDiversity;
    // Unseen public journeys come first; stable ID resolves exact score ties.
    scored.sort((a, b) => Number(a.known) - Number(b.known) || adjusted(b) - adjusted(a) || a.journey.id.localeCompare(b.journey.id, 'en'));
    const alternatives = scored.filter(c => (creators.get(c.features.creatorId || c.journey.id) || 0) < 2 && !c.known);
    const next = alternatives[0] || scored[0]; scored.splice(scored.indexOf(next), 1);
    personalized ||= next.personalizedRelevance;
    results.push({ journey: next.journey, score: next.score, reasons: next.reasons });
    for (const [map, key] of [[creators, next.features.creatorId || next.journey.id], [destinations, next.features.destinationName || next.features.destinationSlug], [travelers, next.journey.travelerType]] as const) map.set(key, (map.get(key) || 0) + 1);
  }
  return { results, personalized };
}
