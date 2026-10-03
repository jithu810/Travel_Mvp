import { JourneyCard } from "./journey-card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Journey } from "@/lib/discovery/types";

export function JourneyGrid({ journeys,emptyTitle,matchingStops }: { journeys: Journey[]; emptyTitle?: string; matchingStops?: Record<string, string[]> }) {
  if (!journeys.length) return <EmptyState title={emptyTitle || "No journeys for this travel style yet."}>{emptyTitle ? "Journeys will appear here when available." : "Try another traveler type or return to All to explore more routes."}</EmptyState>;
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{journeys.map((journey) => <JourneyCard key={journey.id} journey={journey} matchingStops={matchingStops?.[journey.id]}/>)}</div>;
}
