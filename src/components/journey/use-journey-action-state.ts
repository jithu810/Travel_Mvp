"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/env';

type ActionState = { user?: { id: string } | null; liked?: boolean; saved?: boolean; likes?: number };

export function useJourneyActionState(id: string) {
  const [state, setState] = useState<ActionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    if (!getSupabaseConfig()) return;
    const { data: { subscription } } = createClient().auth.onAuthStateChange(() => {
      setState(null);
      setLoading(true);
      setRevision(value => value + 1);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/journeys/${id}/actions`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) { setState(data); setError(''); }
      })
      .catch(cause => {
        if (!controller.signal.aborted) { setState(null); setError(cause.message || 'Account actions could not be loaded.'); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision]);

  return { state, setState, loading, error, refresh };
}
