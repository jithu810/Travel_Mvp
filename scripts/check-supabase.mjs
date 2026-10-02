import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
nextEnv.loadEnvConfig(process.cwd(), false);
for (const file of ['.env.production.local', '.env.local', '.env.production', '.env', '.env.example']) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const populated = name => !!content.match(new RegExp(`^${name}\\s*=\\s*([^\\r\\n]+)`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  console.log(JSON.stringify({ file, urlPresent: populated('NEXT_PUBLIC_SUPABASE_URL'), publishableKeyPresent: populated('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), anonKeyPresent: populated('NEXT_PUBLIC_SUPABASE_ANON_KEY') }));
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.log('Active Next.js configuration: missing Supabase URL or key.'); process.exitCode = 1; }
else {
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } });
    const authResponse = await fetch(new URL('/auth/v1/settings', url), { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
    console.log('Supabase Auth settings HTTP:', authResponse.status);
    for (const table of ['profiles', 'journeys', 'journey_stops', 'journey_likes', 'saved_journeys']) {
      const { error, status } = await client.from(table).select('id', { head: true }).limit(1);
      console.log(JSON.stringify({ table, status, errorCode: error?.code || null, error: error?.message || null }));
    }
    const { data, error, status } = await client.rpc('get_public_journeys', { destination_filter: null, traveler_filter: null, journey_filter: null });
    console.log(JSON.stringify({ rpc: 'get_public_journeys', status, publishedJourneys: Array.isArray(data) ? data.length : null, errorCode: error?.code || null, error: error?.message || null }));
    const detail = await client.rpc('get_journey_detail', { target_id: '00000000-0000-0000-0000-000000000000' });
    console.log(JSON.stringify({ rpc: 'get_journey_detail', status: detail.status, errorCode: detail.error?.code || null, error: detail.error?.message || null }));
  } catch (error) { console.log('Connection check failed:', error.name); process.exitCode = 1; }
}
