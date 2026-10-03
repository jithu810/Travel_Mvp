import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/env';
import { isAllowedRequestOrigin } from '@/lib/request-origin';
import { UUID, TRACK_BATCH, validTrackPoint } from '@/lib/travel/track';
import type { Json } from '@/lib/supabase/database.types';

type Context = { params: Promise<{ id: string }> };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function GET(request: NextRequest, { params }: Context) {
  if (!getSupabaseConfig()) return reply({ ownerId: null, track: null });
  const { id } = await params;
  if (!UUID.test(id)) return reply({ ownerId: null, track: null });
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') return reply({ error: 'Could not verify track ownership.' }, 503);
    if (!user) return reply({ ownerId: null, track: null });
    let query = client.from('travel_tracks').select('id,journey_id,user_id,status,started_at,ended_at,points,revision').eq('user_id', user.id).eq('journey_id', id);
    const trackId = request.nextUrl.searchParams.get('track');
    if (trackId) { if (!UUID.test(trackId)) return reply({ error: 'Invalid track.' }, 400); query = query.eq('id', trackId); }
    const { data, error: readError } = await query.order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (readError) return reply({ ownerId: user.id, error: 'Private track storage is unavailable. Check the travel-track migration.' }, 503);
    return reply({ ownerId: user.id, revision: data?.revision || 0, track: data ? { id: data.id, journeyId: data.journey_id, ownerId: data.user_id, status: data.status, startedAt: Date.parse(data.started_at), endedAt: data.ended_at ? Date.parse(data.ended_at) : null, points: data.points, breakSegment: true } : null });
  } catch { return reply({ error: 'Private track storage is temporarily unavailable.' }, 503); }
}
export async function POST(request: NextRequest, { params }: Context) {
  if (!isAllowedRequestOrigin(request)) return reply({ error: 'Invalid request origin.' }, 403);
  const { id } = await params;
  if (!UUID.test(id)) return reply({ error: 'Invalid journey.' }, 400);
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return reply({ error: 'Login required to save a private track.' }, 401);
    // Bound actual streamed bytes, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Invalid track batch.' }, 400);
    let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 32768) { await reader.cancel(); return reply({ error: 'Track batch is too large.' }, 413); } chunks.push(value); }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (payload?.ownerId !== user.id) return reply({ error: 'Track account changed. Local history was not uploaded.' }, 403);
    const now = Date.now();
    if (!payload || !UUID.test(payload.id) || payload.journeyId !== id || !Number.isInteger(payload.revision) || payload.revision < 0 || !Number.isFinite(payload.startedAt) || payload.startedAt <= 0 || payload.startedAt > now || !['ACTIVE','PAUSED','COMPLETED','CANCELLED'].includes(payload.status) || !Array.isArray(payload.points) || payload.points.length > TRACK_BATCH
      || !payload.points.every((p: unknown) => Array.isArray(p) && p.length === 5 && p.every(Number.isFinite) && Number.isInteger(p[4]) && p[4] >= 0 && p[4] < 500 && validTrackPoint([p[0],p[1],p[2],p[3],0], undefined, now))
      || (payload.endedAt !== null && (!Number.isFinite(payload.endedAt) || payload.endedAt < payload.startedAt || payload.endedAt > now))
      || ['COMPLETED','CANCELLED'].includes(payload.status) !== (payload.endedAt !== null)) return reply({ error: 'Invalid track batch.' }, 400);
    const { data, error } = await client.rpc('append_travel_track', { payload: payload as Json });
    if (error) return reply({ error: error.code === '40001' ? 'Track changed in another tab. This tab will retain its local track.' : 'Private track could not sync. Your local track is retained.' }, error.code === '40001' ? 409 : error.code === '42501' ? 403 : error.code === '22023' ? 400 : 503);
    return reply(data);
  } catch (error) { return reply({ error: error instanceof SyntaxError ? 'Invalid track batch.' : 'Private track could not sync. Your local track is retained.' }, error instanceof SyntaxError ? 400 : 503); }
}
