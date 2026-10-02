import samples from "./demo-journeys.json";
import { getDestination } from "./destinations";
import type { Journey, TravelerType } from "./types";

export const demoJourneys: Journey[] = samples.map((sample) => ({
  id: sample.id, title: sample.title, description: sample.description,
  destinationSlug: sample.destination, travelerType: sample.traveler as TravelerType,
  durationDays: sample.days, coverImage: getDestination(sample.destination)!.image,
  creatorName: "Journey demo studio", creatorAvatar: null, likes: 0, isDemo: true,
  stops: sample.stops.map((name, position) => ({ id: `${sample.id}-${position}`, name, position, description: "An example stop on this sample route." })),
}));
