import { freshLocation, MAX_ARRIVAL_ACCURACY_METERS, type LocationFix } from './location';

export const NAVIGATION_MAP_STYLE = 'mapbox://styles/mapbox/standard';
export const NAVIGATION_CAMERA_ZOOM = 16.2;
export const NAVIGATION_CAMERA_PITCH = 45;
export const NAVIGATION_CAMERA_DURATION_MS = 600;
export const MIN_HEADING_SPEED_METERS_PER_SECOND = 1.5;
export type NavigationCameraState = 'OVERVIEW' | 'FOLLOWING' | 'USER_INTERACTED' | 'RECENTERING';

export function reliableHeading(fix: LocationFix) {
  return freshLocation(fix) && fix.accuracy <= MAX_ARRIVAL_ACCURACY_METERS && fix.heading !== null && Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360 && fix.speed !== null && fix.speed >= MIN_HEADING_SPEED_METERS_PER_SECOND ? fix.heading : null;
}
export function navigationCamera(fix: LocationFix, reducedMotion: boolean) {
  const heading = reliableHeading(fix);
  return { center: [fix.longitude, fix.latitude] as [number, number], zoom: NAVIGATION_CAMERA_ZOOM, pitch: NAVIGATION_CAMERA_PITCH,
    ...(heading !== null ? { bearing: heading } : {}), padding: { top: 120, bottom: 30, left: 30, right: 30 }, duration: reducedMotion ? 0 : NAVIGATION_CAMERA_DURATION_MS };
}
