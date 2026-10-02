"use client";
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function OwnerActions({ id }: { id:string }) {
  const router=useRouter();
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
    <div className="flex flex-wrap gap-3"><Link href={`/create?edit=${id}`} className="inline-flex min-h-11 items-center rounded-full bg-stone-100 px-5 text-sm font-semibold">Edit Journey</Link><button type="button" onClick={()=>setConfirm(true)} className="min-h-11 px-4 text-sm text-red-700">Delete Journey</button></div>
    {confirm && <div className="space-y-2"><p>Delete this journey? This cannot be undone. Remixed copies will remain.</p><div className="flex gap-3"><button disabled={busy} className="min-h-11 rounded-full bg-red-700 px-4 text-sm text-white" onClick={async()=>{
      setBusy(true); setError('');
      try { const response=await fetch(`/api/journeys/${id}`,{ method:'DELETE' }); const data=await response.json(); if (!response.ok) throw new Error(data.error); router.replace('/profile?deleted=1'); router.refresh(); }
      catch(cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Deleting…' : 'Confirm Delete'}</button><button disabled={busy} onClick={()=>setConfirm(false)} className="min-h-11 px-4 text-sm">Cancel</button></div></div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
