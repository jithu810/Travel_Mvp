import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedRequestOrigin } from '@/lib/request-origin';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/env';
import { validateJourney } from '@/lib/journey/editor';
import type { Json } from '@/lib/supabase/database.types';
export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error: 'This request is not allowed.' }, { status: 403 });
  if (!getSupabaseConfig()) return NextResponse.json({ error: 'Connect Supabase before saving journeys.' }, { status: 503 });
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please log in again before saving.' }, { status: 401 });
    let payload: unknown;
    try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid journey data.' }, { status: 400 }); }
    const invalid = validateJourney(payload);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const { data,error } = await client.rpc('save_journey', { payload: payload as Json });
    if (error) {
      const status = error.code === '40001' ? 409 : error.code === '42501' || error.code === '23505' ? 403 : error.code === '22023' ? 400 : 503;
      const message = status === 409 ? 'This draft changed in another tab. Reload before saving.' : status === 403 ? 'Only your own journeys can be edited.' : status === 400 ? 'Check the journey details, stop order and uploaded images.' : 'Journey could not be saved. Check Supabase setup and try again.';
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Journey could not be saved. Please try again.' }, { status: 503 }); }
}
