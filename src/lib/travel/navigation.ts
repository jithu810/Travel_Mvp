import { hasCoordinates } from '../journey/map-data';
import { distanceMeters, freshLocation, MAX_ARRIVAL_ACCURACY_METERS, type LocationFix } from './location';
import type { TravelStatus } from './session';
import { DeviationConfirmation, MIN_REROUTE_INTERVAL_MS } from './rerouting';

export const NAVIGATION_NOTICE_DURATION_MS = 5_000;
export const ROUTE_MOVEMENT_METERS = 150;
export const ROUTE_REFRESH_INTERVAL_MS = 30_000;
export const ROUTE_MAX_AGE_MS = 120_000;
export const ROUTE_RETRY_INTERVAL_MS = 5_000;
export const ROUTE_TIMEOUT_MS = 15_000;
export const MANEUVER_MATCH_METERS = 50;
export type RoadGeometry = { type: 'LineString'; coordinates: number[][] };
type Point = { latitude: number; longitude: number };
export type NavigationDestination = { id: string; name: string; latitude: number | null; longitude: number | null };
export type NavigationStep = { instruction: string; type: string; distance: number; geometry: RoadGeometry };
export type RoadRoute = { geometry: RoadGeometry; distance: number; duration: number | null; steps: NavigationStep[] };
export type Transportation = 'driving' | 'walking';
export type NavigationInput = { status: TravelStatus; fix: LocationFix | null; destination: NavigationDestination | undefined; online: boolean; transportation?: Transportation };
export type NavigationState = { destinationKey: string; route: RoadRoute | null; status: 'idle' | 'calculating' | 'rerouting' | 'active' | 'unavailable'; warning: string; calculatedAt: number; routeStale: boolean; checkingRoute: boolean; notice: string };
export const emptyNavigation = (): NavigationState => ({ destinationKey: '', route: null, status: 'idle', warning: '', calculatedAt: 0, routeStale: false, checkingRoute: false, notice: '' });
export function destinationKey(destination: NavigationDestination | undefined) { return destination && hasCoordinates(destination) ? `${destination.id}:${destination.longitude}:${destination.latitude}` : ''; }
export function navigationKey(input: Pick<NavigationInput, 'destination' | 'transportation'>) { const key = destinationKey(input.destination); return key ? `${key}:${input.transportation || 'driving'}` : ''; }
export function routingReady(input: NavigationInput, now = Date.now()) { return input.status === 'ACTIVE' && !!destinationKey(input.destination) && !!input.fix && freshLocation(input.fix, now) && input.fix.accuracy <= MAX_ARRIVAL_ACCURACY_METERS; }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function geometry(value: unknown): RoadGeometry | null {
  const line = record(value);
  if (line.type !== 'LineString' || !Array.isArray(line.coordinates) || line.coordinates.length < 2 || line.coordinates.length > 100_000) return null;
  if (!line.coordinates.every(p => Array.isArray(p) && p.length === 2 && hasCoordinates({ longitude: p[0], latitude: p[1] }))) return null;
  return { type: 'LineString', coordinates: line.coordinates as number[][] };
}
export class RoutingError extends Error {}
export function parseRoadRoute(value: unknown): RoadRoute {
  const body = record(value);
  if (body.code === 'NoRoute' || body.code === 'NoSegment') throw new RoutingError('No road route found for these locations. You can continue manually.');
  if (body.code !== 'Ok' || !Array.isArray(body.routes)) throw new RoutingError('Mapbox returned an invalid routing response. Retry route.');
  const route = record(body.routes[0]), line = geometry(route.geometry);
  if (!line || !nonnegative(route.distance)) throw new RoutingError('Mapbox returned an invalid routing response. Retry route.');
  const steps: NavigationStep[] = [];
  for (const leg of Array.isArray(route.legs) ? route.legs : []) for (const item of Array.isArray(record(leg).steps) ? record(leg).steps as unknown[] : []) {
    const step = record(item), maneuver = record(step.maneuver), shape = geometry(step.geometry);
    if (shape && nonnegative(step.distance) && typeof maneuver.instruction === 'string' && maneuver.instruction.trim() && typeof maneuver.type === 'string')
      steps.push({ instruction: maneuver.instruction.slice(0, 500), type: maneuver.type.slice(0, 50), distance: step.distance, geometry: shape });
  }
  return { geometry: line, distance: route.distance, duration: nonnegative(route.duration) ? route.duration : null, steps };
}
export function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `~${minutes} min` : `~${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

// Provider instructions only. Conservative local projection is not a map-matching SDK.
// Ambiguous intersections/off-road fixes hide live guidance rather than guessing a turn.
export function nextManeuver(route: RoadRoute, fix: LocationFix | null) {
  if (!fix || !freshLocation(fix) || fix.accuracy > MAX_ARRIVAL_ACCURACY_METERS) return null;
  const matches: { index: number; distance: number; remaining: number }[] = [];
  route.steps.forEach((step, index) => {
    const points = step.geometry.coordinates;
    let length = 0, best = Infinity, along = 0;
    for (let i = 1; i < points.length; i++) {
      const a = { longitude: points[i - 1][0], latitude: points[i - 1][1] }, b = { longitude: points[i][0], latitude: points[i][1] };
      if (Math.abs(a.longitude - b.longitude) > 180) return;
      const scale = Math.cos(fix.latitude * Math.PI / 180), dx = (b.longitude - a.longitude) * scale, dy = b.latitude - a.latitude;
      const t = Math.max(0, Math.min(1, ((fix.longitude - a.longitude) * scale * dx + (fix.latitude - a.latitude) * dy) / (dx * dx + dy * dy || 1)));
      const distance = distanceMeters(fix, { latitude: a.latitude + t * (b.latitude - a.latitude), longitude: a.longitude + t * (b.longitude - a.longitude) });
      const segment = distanceMeters(a, b);
      if (distance < best) { best = distance; along = length + t * segment; }
      length += segment;
    }
    if (best + fix.accuracy <= MANEUVER_MATCH_METERS && length > 0) matches.push({ index, distance: best, remaining: step.distance * Math.max(0, 1 - along / length) });
  });
  matches.sort((a, b) => a.distance - b.distance);
  if (!matches.length || matches.some(m => Math.abs(m.index - matches[0].index) > 1 && m.distance < matches[0].distance + fix.accuracy)) return null;
  const match = matches[0], step = route.steps[match.index + 1];
  return step ? { instruction: step.instruction, type: step.type, distance: match.remaining } : null;
}

export async function requestRoadRoute(origin: Point, destination: Point, token: string, signal: AbortSignal, transport: typeof fetch = fetch, transportation: Transportation = 'driving'): Promise<RoadRoute> {
  if (!hasCoordinates(origin) || !hasCoordinates(destination)) throw new RoutingError('Navigation unavailable for these coordinates.');
  if (!token || !token.startsWith('pk.')) throw new RoutingError('Road routing needs a valid public Mapbox token.');
  // POST keeps precise coordinates out of URLs; only the provider receives this body.
  const body = new URLSearchParams({ coordinates: `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`, geometries: 'geojson', overview: 'full', steps: 'true', alternatives: 'false', language: 'en' });
  const response = await transport(`https://api.mapbox.com/directions/v5/mapbox/${transportation}?access_token=${encodeURIComponent(token)}`, { method: 'POST', body, signal, cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new RoutingError(response.status === 401 || response.status === 403 ? 'Mapbox token or allowed-origin configuration needs attention.' : response.status === 429 ? 'Mapbox request limit reached. Wait before retrying route.' : 'Mapbox routing is temporarily unavailable. Retry route.');
  try { return parseRoadRoute(await response.json()); } catch (error) { if (error instanceof RoutingError) throw new RoutingError(transportation === 'walking' && error.message.startsWith('No road route') ? 'No walking route found for these locations. You can continue manually or choose Driving.' : error.message); throw new RoutingError('Mapbox returned an invalid routing response. Retry route.'); }
}

export type RouteLoader = (origin: Point, destination: Point, signal: AbortSignal, transportation: Transportation) => Promise<RoadRoute>;
// One in-memory route, one request, no GPS history or persistent track.
export class NavigationController {
  private state = emptyNavigation();
  private input: NavigationInput | null = null;
  private origin: LocationFix | null = null;
  private attemptedAt = 0;
  private failed = false;
  private sequence = 0;
  private pending: AbortController | null = null;
  private deviation = new DeviationConfirmation();
  private lastRerouteAt = 0;
  constructor(private load: RouteLoader, private emit: (state: NavigationState) => void, private now = Date.now) {}
  private publish(patch: Partial<NavigationState>) {
    const next = { ...this.state, ...patch };
    if (Object.keys(next).every(key => next[key as keyof NavigationState] === this.state[key as keyof NavigationState])) return;
    this.state = next; this.emit(this.state);
  }
  private cancel() { this.sequence++; this.pending?.abort(); this.pending = null; }
  stop() { this.cancel(); this.input = null; this.origin = null; this.attemptedAt = 0; this.failed = false; this.lastRerouteAt = 0; this.deviation.reset(); this.publish(emptyNavigation()); }
  update(input: NavigationInput, retry = false) {
    this.input = input;
    const key = navigationKey(input), now = this.now();
    if (this.state.notice && now - this.state.calculatedAt >= NAVIGATION_NOTICE_DURATION_MS) this.publish({ notice: '' });
    if (input.status !== 'ACTIVE' || !key) { this.stop(); return; }
    if (key !== this.state.destinationKey) {
      this.cancel(); this.origin = null; this.attemptedAt = 0; this.failed = false; this.lastRerouteAt = 0; this.deviation.reset();
      this.publish({ ...emptyNavigation(), destinationKey: key });
    }
    if (!routingReady(input, now)) { this.cancel(); this.deviation.reset(); this.publish({ checkingRoute: false, status: this.failed ? 'unavailable' : this.state.route ? 'active' : 'idle', warning: 'Waiting for a fresh, accurate GPS position. Route is not being updated.' }); return; }
    if (!input.online) { this.cancel(); this.failed = true; this.publish({ status: 'unavailable', checkingRoute: false, warning: 'Network unavailable. Any displayed route is the last calculation, not offline navigation.' }); return; }
    if (this.state.warning === 'Waiting for a fresh, accurate GPS position. Route is not being updated.') this.publish({ warning: '' });
    const moved = this.origin ? distanceMeters(this.origin, input.fix!) : Infinity;
    if (this.pending) {
      if (moved >= ROUTE_MOVEMENT_METERS) { this.cancel(); this.publish({ status: this.state.route ? 'active' : 'idle', warning: 'Position changed while calculating. Waiting to refresh route.' }); }
      else return;
    }
    const elapsed = now - this.attemptedAt;
    const deviation = this.state.route ? this.deviation.update(input.fix, this.state.route.geometry, now) : { suspect: false, confirmed: false };
    this.publish({ checkingRoute: deviation.suspect && !deviation.confirmed && !this.failed });
    if (deviation.confirmed) this.publish({ routeStale: true, notice: '' });
    const reroute = deviation.confirmed && elapsed >= ROUTE_REFRESH_INTERVAL_MS && (!this.lastRerouteAt || now - this.lastRerouteAt >= MIN_REROUTE_INTERVAL_MS);
    if (retry ? elapsed < ROUTE_RETRY_INTERVAL_MS : this.failed || (deviation.suspect ? !reroute : this.origin && (elapsed < ROUTE_REFRESH_INTERVAL_MS || (moved < ROUTE_MOVEMENT_METERS && now - this.state.calculatedAt < ROUTE_MAX_AGE_MS)))) return;
    this.cancel(); const sequence = this.sequence;
    const controller = new AbortController(); this.pending = controller; this.origin = input.fix!; this.attemptedAt = now; this.failed = false;
    const rerouting = !!this.state.route && (reroute || this.state.routeStale);
    if (rerouting) this.lastRerouteAt = now;
    this.publish({ status: rerouting ? 'rerouting' : 'calculating', checkingRoute: false, warning: '', notice: '' });
    const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
    void this.load(input.fix!, input.destination as NavigationDestination & Point, controller.signal, input.transportation || 'driving').then(route => {
      if (sequence !== this.sequence || !this.input || !routingReady(this.input, this.now()) || key !== navigationKey(this.input)) return;
      if (distanceMeters(input.fix!, this.input.fix!) >= ROUTE_MOVEMENT_METERS) { this.publish({ status: this.state.route ? 'active' : 'idle', warning: 'Position changed while calculating. Waiting to refresh route.' }); return; }
      this.deviation.reset();
      this.publish({ route, status: 'active', calculatedAt: this.now(), warning: '', routeStale: false, checkingRoute: false, notice: rerouting ? 'Route updated' : '' });
    }).catch(error => {
      if (sequence !== this.sequence) return;
      this.failed = true;
      this.publish({ status: 'unavailable', checkingRoute: false, warning: error instanceof RoutingError ? error.message : controller.signal.aborted ? 'Route calculation timed out. Retry route.' : 'Network error calculating route. Retry route.' });
    }).finally(() => { clearTimeout(timer); if (sequence === this.sequence) this.pending = null; });
  }
}
