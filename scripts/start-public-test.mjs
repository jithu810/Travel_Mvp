import { spawn } from 'node:child_process';
// Public fallback tests require an unconfigured build; NEXT_PUBLIC values are
// compiled by Next, so blank runtime values alone cannot isolate local services.
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', NEXT_PUBLIC_MAPBOX_TOKEN: '', NEXT_PUBLIC_SITE_URL: '', JOURNEY_CREATION_TEST: '' };
const next = 'node_modules/next/dist/bin/next';
const build = spawn(process.execPath, [next, 'build'], { env, stdio: 'inherit' });
const result = await new Promise(resolve => build.on('exit', resolve));
if (result !== 0) process.exit(result || 1);
const server = spawn(process.execPath, [next, 'start', '-p', '3100'], { env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.kill(signal); process.exit(); });
server.on('exit', code => process.exit(code || 0));
