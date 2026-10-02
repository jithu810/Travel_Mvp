import type { Journey } from "@/lib/discovery/types";

export type JourneyStop = {
  id: string; sequence: number; name: string; description: string;
  latitude: number | null; longitude: number | null;
  photo: string | null; rating: number | null; dayNumber: number | null;
};

export type JourneyDetail = Omit<Journey, "stops"> & {
  creatorId: string | null; creatorUsername: string | null;
  status: "draft" | "published"; copiedFrom: string | null;
  liked: boolean; saved: boolean; viewerId: string | null;
  stops: JourneyStop[];
};
