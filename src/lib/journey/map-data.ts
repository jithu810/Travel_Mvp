import type { JourneyStop } from "./types";

export function orderedStops(stops: JourneyStop[]) {
  return [...stops].sort((a, b) => a.sequence - b.sequence);
}

export function hasCoordinates(stop: JourneyStop): stop is JourneyStop & { latitude: number; longitude: number } {
  return typeof stop.latitude === "number" && typeof stop.longitude === "number" && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude) && Math.abs(stop.latitude) <= 90 && Math.abs(stop.longitude) <= 180;
}

export function buildMapData(stops: JourneyStop[]) {
  const ordered = orderedStops(stops);
  const markers = ordered.flatMap((stop, index) => hasCoordinates(stop) ? [{ ...stop, number: index + 1 }] : []);
  // Break the line at missing coordinates rather than implying an invented leg.
  const segments: number[][][] = [];
  let segment: number[][] = [];
  for (const stop of ordered) {
    if (hasCoordinates(stop)) segment.push([stop.longitude, stop.latitude]);
    else { if (segment.length > 1) segments.push(segment); segment = []; }
  }
  if (segment.length > 1) segments.push(segment);
  return { markers, missing: ordered.length - markers.length, line: { type: "Feature" as const, properties: {}, geometry: { type: "MultiLineString" as const, coordinates: segments } } };
}
