import type { Journey } from './types';

export type ExploreStop = { id: string; name: string; position: number; coordinates: [number, number] | null };
export type ExploreJourney = Journey & {
  destinationName: string;
  coordinates: [number, number] | null;
  mapStops: ExploreStop[];
  matchingStops: string[];
};
export type ExploreResult = { journeys: ExploreJourney[]; source: 'supabase'; loaded: boolean; total?: number; page?: number; pages?: number; error?: string };
