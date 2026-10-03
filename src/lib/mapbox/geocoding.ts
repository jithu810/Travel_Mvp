export type MapboxFeature = {
  id: string;
  geometry?: { coordinates?: number[] };
  bbox?: number[];
  properties?: {
    name?: string; name_preferred?: string; full_address?: string; place_formatted?: string;
    mapbox_id?: string; feature_type?: string; bbox?: number[];
    context?: Record<string, { name?: string; mapbox_id?: string; country_code?: string }>;
  };
};

type SearchOptions = { country?: string; proximity?: [number, number]; types?: string; language?: string; limit?: number };

// Shared Geocoding v6 transport. Create keeps its India/proximity options;
// destination discovery supplies geographic types with no country restriction.
export async function searchMapboxPlaces(query: string, token: string, options: SearchOptions, signal: AbortSignal): Promise<MapboxFeature[]> {
  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.search = new URLSearchParams({
    q: query.trim(), access_token: token, autocomplete: 'true', permanent: 'true', limit: String(options.limit || 5),
    ...(options.country ? { country: options.country } : {}),
    ...(options.proximity ? { proximity: options.proximity.join(',') } : {}),
    ...(options.types ? { types: options.types } : {}),
    ...(options.language ? { language: options.language } : {}),
  }).toString();
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  if (!response.ok) throw new Error('Mapbox search is unavailable.');
  const data = await response.json();
  if (!Array.isArray(data.features)) throw new Error('Mapbox returned an invalid search response.');
  return data.features.filter((feature: MapboxFeature) => feature && typeof feature.id === 'string' && feature.properties);
}
