"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/env';

export function AccountMenu({ onUserChange }: { onUserChange?: (authenticated:boolean)=>void }) {
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const displayName = typeof user?.user_metadata.display_name === 'string' ? user.user_metadata.display_name : null;
  useEffect(() => {
    if (!getSupabaseConfig()) return;
    const client = createClient();
    let active = true;
    void client.auth.getUser().then(({ data }) => { if (active) { setUser(data.user); onUserChange?.(!!data.user); } });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => { if (active) { setUser(session?.user || null); onUserChange?.(!!session?.user); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [onUserChange]);
  return <div className="flex min-w-0 max-w-[48vw] flex-wrap items-center gap-2 text-sm md:max-w-60">
    <Link href={user ? '/profile' : '/login'} aria-label={user ? 'Your profile' : 'Login / Profile'} className="inline-flex min-h-11 min-w-0 max-w-full items-center rounded-full border border-stone-200 px-4 md:max-w-48"><span className="truncate">{user ? displayName || 'Profile' : 'Login'}</span></Link>
    {user && <button disabled={busy} className="min-h-11 px-3 underline disabled:opacity-60" onClick={async () => {
      setBusy(true); setError('');
      try { const { error } = await createClient().auth.signOut(); if (error) throw error; setUser(null); onUserChange?.(false); router.replace('/'); router.refresh(); }
      catch { setError('Logout failed. Please try again.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Logging out…' : 'Logout'}</button>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
