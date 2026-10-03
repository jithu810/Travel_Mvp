import type { Page } from '@playwright/test';

export type GpsMock = { watches: number; clears: number; active: number; permission: PermissionState; emit: (latitude: number, longitude: number, accuracy?: number, timestamp?: number) => void; fail: (code: number) => void; late: () => void };
export async function mockGeolocation(page: Page, permission: PermissionState = 'prompt') {
  await page.addInitScript(permission => {
    let nextId = 0;
    const active = new Map<number, { success: PositionCallback; error?: PositionErrorCallback | null }>();
    const old: PositionCallback[] = [];
    const mock = { watches: 0, clears: 0, get active() { return active.size; }, permission,
      emit(latitude: number, longitude: number, accuracy = 10, timestamp = Date.now()) {
        const position = { coords: { latitude, longitude, accuracy, heading: 0, speed: 0, altitude: null, altitudeAccuracy: null }, timestamp } as GeolocationPosition;
        for (const watch of [...active.values()]) watch.success(position);
      },
      fail(code: number) { for (const watch of [...active.values()]) watch.error?.({ code, message: 'Mock error' } as GeolocationPositionError); },
      late() { for (const callback of old) callback({ coords: { latitude: 8.723348, longitude: 77.02781, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition); },
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(success: PositionCallback, error: PositionErrorCallback) { const id = ++nextId; mock.watches++; active.set(id, { success, error }); return id; },
      clearWatch(id: number) { const callback = active.get(id)?.success; if (callback) old.push(callback); active.delete(id); mock.clears++; },
    } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: mock.permission }) } });
    (window as unknown as { gpsMock: GpsMock }).gpsMock = mock;
  }, permission);
}

export async function emitLocation(page: Page, latitude: number, longitude: number, accuracy = 10, ageMs = 0) {
  await page.evaluate(({ latitude, longitude, accuracy, ageMs }) => (window as unknown as { gpsMock: GpsMock }).gpsMock.emit(latitude, longitude, accuracy, Date.now() - ageMs), { latitude, longitude, accuracy, ageMs });
}

export async function gpsCounts(page: Page) {
  return page.evaluate(() => { const mock = (window as unknown as { gpsMock: GpsMock }).gpsMock; return { watches: mock.watches, clears: mock.clears, active: mock.active }; });
}
