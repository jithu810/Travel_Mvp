import { spawn } from 'node:child_process';
const env = { ...process.env,JOURNEY_CREATION_TEST: '1',NEXT_PUBLIC_SITE_URL: 'https://journey.example',NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-public-key',NEXT_PUBLIC_SUPABASE_ANON_KEY: '' };
const next = 'node_modules/next/dist/bin/next';
const build = spawn(process.execPath,[next,'build'],{ env,stdio: 'inherit' });
const result = await new Promise(resolve => build.on('exit',resolve));
if (result !== 0) process.exit(result || 1);
const server = spawn(process.execPath,[next,'start','-p','3200'],{ env,stdio: 'inherit' });
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => { server.kill(signal); process.exit(); });
server.on('exit',code => process.exit(code || 0));
