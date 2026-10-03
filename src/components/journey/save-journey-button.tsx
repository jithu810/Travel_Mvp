"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJourneyActionState } from './use-journey-action-state';
import { LoginDialog } from '@/components/auth/login-dialog';
export function SaveJourneyButton({ id,title,removable=false }: { id: string; title: string; initialSaved?: boolean; removable?: boolean }) {
  const router=useRouter();
  const { state,setState,loading,error:stateError,refresh }=useJourneyActionState(id);
  const saved=!!state?.user && state.saved===true;
  const [busy,setBusy]=useState(false),[login,setLogin]=useState(false),[error,setError]=useState('');
  async function toggle() {
    setBusy(true); setError('');
    try {
      const stateResponse=await fetch(`/api/journeys/${id}/actions`,{ cache:'no-store' });
      const state=await stateResponse.json();
      if (!stateResponse.ok) throw new Error('Saved state could not be loaded.');
      if (!state.user) { setLogin(true); return; }
      const response=await fetch(`/api/journeys/${id}/actions`,{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ action:'save',enabled:!(state.saved ?? saved) }) });
      const result=await response.json();
      if (response.status===401) { setLogin(true); return; }
      if (!response.ok) throw new Error(result.error || 'Please try again.');
      setState(previous => previous?.user && previous.user.id === state.user.id ? { ...result,user:previous.user } : previous); if (removable) router.refresh();
    } catch(cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <div><button type="button" disabled={busy || loading || !!stateError} aria-label={`${saved ? 'Remove saved' : 'Save'} ${title}`} aria-pressed={saved} title="Keep this journey for later" onClick={toggle} className="flex min-h-11 items-center rounded-full bg-stone-50 px-3 text-xs text-brand">{busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}</button>{stateError && <p role="alert" className="max-w-40 text-xs text-red-700">{stateError}</p>}{error && <p role="alert" className="max-w-40 text-xs text-red-700">{error}</p>}{login && <LoginDialog intent="save" onClose={()=>setLogin(false)} onLogin={()=>{ setLogin(false); refresh(); router.refresh(); }}/>}</div>;
}
