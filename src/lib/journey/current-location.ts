import { hasCoordinates } from './map-data';

// User-triggered, one-time capture; Travel Mode alone owns the persistent watcher.
export function currentStopLocation(geolocation: Pick<Geolocation, 'getCurrentPosition'> | undefined = navigator.geolocation): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error('GPS is unavailable. Search for a place or pick on map.')); return; }
    geolocation.getCurrentPosition(position => {
      const { latitude, longitude, accuracy } = position.coords;
      if (!hasCoordinates({ latitude, longitude }) || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50 || !Number.isFinite(position.timestamp) || Math.abs(Date.now() - position.timestamp) > 15000) {
        reject(new Error('A fresh, accurate location is unavailable. Try again outdoors or pick on map.')); return;
      }
      resolve({ latitude, longitude });
    }, error => reject(new Error(error.code === 1 ? 'Location permission denied. Search for a place or pick on map.' : 'Could not get a fresh location. Try again or pick on map.')), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  });
}
