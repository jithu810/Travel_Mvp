"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/env';
import { safeNext } from '@/lib/auth/redirect';

export function AuthForm({ next = '/profile', onLogin }: { next?: string; onLogin?: () => void }) {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (!getSupabaseConfig()) return <p className="mt-5 rounded-xl bg-stone-100 p-4 text-sm">Account actions are not available in this unconnected preview. You can keep exploring public journeys.</p>;
  return <form className="mt-5 space-y-4" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email')).trim();
    const password = String(values.get('password'));
    try {
      const client = createClient();
      if (signup) {
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: String(values.get('name')).trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}` } });
        if (error) throw error;
        if (!data.session) { setMessage('Check your email to confirm your account, then log in.'); return; }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      if (onLogin) onLogin(); else router.replace(safeNext(next));
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication is unavailable. Please try again.'); }
    finally { setBusy(false); }
  }}>
    {signup && <label className="block text-sm font-medium">Name<input name="name" autoComplete="name" maxLength={100} required className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 px-3"/></label>}
    <label className="block text-sm font-medium">Email<input name="email" type="email" autoComplete="email" required className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 px-3"/></label>
    <label className="block text-sm font-medium">Password<input name="password" type="password" minLength={signup ? 8 : undefined} autoComplete={signup ? 'new-password' : 'current-password'} required className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 px-3"/></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-brand">{message}</p>}
    <button disabled={busy} className="min-h-12 w-full rounded-full bg-brand text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Please wait…' : signup ? 'Sign up' : 'Log in'}</button>
    <button type="button" disabled={busy} onClick={() => { setSignup(!signup); setError(''); setMessage(''); }} className="min-h-11 w-full text-sm underline underline-offset-4">{signup ? 'Already have an account? Log in' : 'New to Journey? Sign up'}</button>
  </form>;
}
