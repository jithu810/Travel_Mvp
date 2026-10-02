import 'server-only';
import { redirect } from 'next/navigation';
import { getSupabaseConfig } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export async function requireUser(next: string) {
  if (!getSupabaseConfig()) redirect(`/login?next=${encodeURIComponent(next)}`);
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw new Error('Unable to verify your account. Please try again.');
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { user, client };
}
