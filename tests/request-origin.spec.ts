import { expect, test } from '@playwright/test';
import { NextRequest } from 'next/server';
import { isAllowedRequestOrigin } from '../src/lib/request-origin';

test('LAN exception is exact, Host-bound, and absent in production', () => {
  const original = process.env.NODE_ENV;
  const request = (origin?: string, host = '192.168.1.4:3000') => new NextRequest('http://localhost:3000/api/journeys', {
    headers: { host, ...(origin ? { origin } : {}) },
  });
  try {
    Object.assign(process.env, { NODE_ENV: 'development' });
    expect(isAllowedRequestOrigin(request('http://192.168.1.4:3000'))).toBe(true);
    expect(isAllowedRequestOrigin(request('http://localhost:3000', 'localhost:3000'))).toBe(true);
    for (const origin of [undefined, 'null', 'https://unrelated.example', 'http://192.168.1.4:3001', 'https://192.168.1.4:3000', 'http://localhost:3000']) {
      expect(isAllowedRequestOrigin(request(origin))).toBe(false);
    }
    expect(isAllowedRequestOrigin(request('http://192.168.1.4:3000', 'localhost:3000'))).toBe(false);
    Object.assign(process.env, { NODE_ENV: 'production' });
    expect(isAllowedRequestOrigin(request('http://192.168.1.4:3000'))).toBe(false);
    expect(isAllowedRequestOrigin(request('http://localhost:3000'))).toBe(true);
  } finally {
    if (original === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: original });
  }
});
