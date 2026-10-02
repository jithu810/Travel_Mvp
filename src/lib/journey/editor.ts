import { getDestination } from '@/lib/discovery/destinations';
export type EditorStop = { id: string; sequence: number; name: string; description: string; latitude: number | null; longitude: number | null; mapbox_place_id: string | null; photo_path: string | null; rating: number | null; day_number: number | null };
export type JourneyInput = { id: string; title: string; description: string; destination_slug: string; traveler_type: string; duration_days: number; cover_image_path: string | null; status: 'draft' | 'published'; updated_at: string | null; stops: EditorStop[] };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateJourney(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Invalid journey data.';
  const j = value as JourneyInput;
  if (typeof j.id !== 'string' || !uuidPattern.test(j.id)) return 'Invalid journey ID.';
  if (typeof j.title !== 'string' || !j.title.trim() || j.title.trim().length > 200) return 'Enter a journey title (up to 200 characters).';
  if (!getDestination(j.destination_slug)) return 'Select a destination.';
  if (!['solo','couple','friends','family'].includes(j.traveler_type)) return 'Select a traveler type.';
  if (!['draft','published'].includes(j.status)) return 'Invalid save action.';
  if (!Number.isInteger(j.duration_days) || j.duration_days < 1 || j.duration_days > 365) return 'Duration must be 1–365 days.';
  if (typeof j.description !== 'string' || j.description.length > 5000) return 'Description must be under 5,000 characters.';
  if (j.updated_at !== null && (typeof j.updated_at !== 'string' || !Number.isFinite(Date.parse(j.updated_at)))) return 'Invalid draft version. Reload the page.';
  if (!Array.isArray(j.stops) || j.stops.length > 50 || (j.status === 'published' && !j.stops.length)) return 'Add at least one stop before publishing (maximum 50).';
  if (new Set(j.stops.map(s => s?.id)).size !== j.stops.length) return 'Stops must have unique IDs.';
  const validPhoto = (photo: unknown) => photo === null || (typeof photo === 'string' && photo.length <= 2000);
  if (!validPhoto(j.cover_image_path)) return 'Invalid cover image.';
  for (const [index,s] of j.stops.entries()) {
    if (!s || typeof s.id !== 'string' || !uuidPattern.test(s.id) || s.sequence !== index + 1) return 'Stop sequence must be 1, 2, 3… without duplicates.';
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 200 || typeof s.description !== 'string' || s.description.length > 1000) return 'Check stop names and descriptions.';
    if (s.latitude === null && s.longitude === null && j.status === 'draft') { /* Incomplete copied stops can remain private. */ }
    else if (typeof s.latitude !== 'number' || !Number.isFinite(s.latitude) || s.latitude < -90 || s.latitude > 90 || typeof s.longitude !== 'number' || !Number.isFinite(s.longitude) || s.longitude < -180 || s.longitude > 180) return 'Every published stop needs valid coordinates. Select a place from search.';
    if (s.rating !== null && (typeof s.rating !== 'number' || !Number.isFinite(s.rating) || s.rating < 0 || s.rating > 5)) return 'Stop ratings must be between 0 and 5.';
    if (s.day_number !== null && (!Number.isInteger(s.day_number) || s.day_number < 1 || s.day_number > j.duration_days)) return 'Stop days must fit within the journey duration.';
    if (!validPhoto(s.photo_path) || (s.mapbox_place_id !== null && (typeof s.mapbox_place_id !== 'string' || s.mapbox_place_id.length > 500))) return 'Invalid stop metadata.';
  }
  return null;
}
