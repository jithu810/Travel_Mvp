import { expect, test } from '@playwright/test';
import { createStopId } from '../src/lib/journey/stop-id';

test('stop IDs stay UUID v4 when HTTP LAN does not expose randomUUID', () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  try {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    const ids = Array.from({ length: 100 }, () => createStopId());
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor);
    else Reflect.deleteProperty(crypto, 'randomUUID');
  }
});
