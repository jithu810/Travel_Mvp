import type { NextRequest } from 'next/server';

/** Retain production origin validation; accommodate only this dev LAN host. */
export function isAllowedRequestOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (process.env.NODE_ENV !== 'development') return origin === request.nextUrl.origin;
  const host = request.headers.get('host');
  if (origin !== `${request.nextUrl.protocol}//${host}`) return false;
  return origin === request.nextUrl.origin || origin === 'http://192.168.1.4:3000';
}
