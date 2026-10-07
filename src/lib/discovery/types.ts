export const travelerTypes = ["solo", "couple", "friends", "family"] as const;
export type TravelerType = typeof travelerTypes[number];
export type TravelerFilter = TravelerType | "all";

export function parseTravelerFilter(value: unknown): TravelerFilter {
  return typeof value === "string" && travelerTypes.some((type) => type === value) ? value as TravelerType : "all";
}

export type Journey = {
  creatorId?: string | null; creatorUsername?: string | null; status?: 'draft' | 'published'; saved?: boolean;
  id: string; title: string; description: string; destinationSlug: string; destinationName?: string | null;
  travelerType: TravelerType; durationDays: number; coverImage: string;
  creatorName: string; creatorAvatar: string | null; likes: number; isDemo: boolean;
  stops: { id: string; name: string; description: string; position: number }[];
};

export type DiscoveryResult = { journeys: Journey[]; source: "supabase" | "demo"; error?: string };
