"use client";
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreatorAvatar } from '@/components/journey/creator-avatar';
import { type ProfileInput,validateProfile } from '@/lib/profile/validation';
import { optimizeJourneyImage,journeyPhotoAccept } from '@/lib/journey/optimize-image';
const field='mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3';
export function ProfileForm({ initial,avatar }: { initial:ProfileInput; avatar:string | null }) {
  const router=useRouter();
  const [form,setForm]=useState(initial),[preview,setPreview]=useState(avatar),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const uploadInFlight=useRef(false);
  const [photoStage,setPhotoStage]=useState<'optimizing' | 'uploading' | null>(null);
  async function upload(file:File | undefined) {
    if (!file || uploadInFlight.current || busy) return;
    uploadInFlight.current=true;
    setError(''); setMessage('');
    setBusy(true); setPhotoStage('optimizing');
    try { const optimized=await optimizeJourneyImage(file); setPhotoStage('uploading'); const data=new FormData(); data.set('file',optimized); const response=await fetch('/api/profile/avatar',{ method:'POST',body:data }); const result=await response.json().catch(()=>{ throw new Error(response.status===413 ? 'This photo is still too large to upload. Please try a smaller photo.' : 'Photo upload failed. Please try again.'); }); if (!response.ok) throw new Error(result.error || 'Photo upload failed. Please try again.'); setForm(current=>({ ...current,avatar_path:result.path })); setPreview(result.preview); setMessage('Avatar uploaded. Save your profile to use it.'); }
    catch(cause) { setError(cause instanceof TypeError ? 'Photo upload failed. Check your connection and try again.' : cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { uploadInFlight.current=false; setPhotoStage(null); setBusy(false); }
  }
  return <form className="max-w-xl space-y-5 rounded-3xl border border-stone-200 bg-white p-6" onSubmit={async event=>{
    event.preventDefault(); setError(''); setMessage('');
    if (!validateProfile(form)) { setError('Check your name, username and bio.'); return; }
    setBusy(true);
    try { const response=await fetch('/api/profile',{ method:'PATCH',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(form) }); const data=await response.json(); if (!response.ok) throw new Error(data.error); router.push(`/profile/${data.username}?updated=1`); router.refresh(); }
    catch(cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { setBusy(false); }
  }}><fieldset disabled={busy} className="space-y-5"><CreatorAvatar name={form.display_name || form.username || 'Traveler'} src={preview}/>
    <label className="block text-sm font-medium">Display name<input maxLength={80} value={form.display_name} onChange={e=>setForm({ ...form,display_name:e.target.value })} className={field}/></label>
    <label className="block text-sm font-medium">Username<input required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_]{3,30}" value={form.username} onChange={e=>setForm({ ...form,username:e.target.value })} className={field}/></label>
    <p className="text-xs text-stone-500">3–30 letters, numbers or underscores. Your profile link uses this username.</p>
    <label className="block text-sm font-medium">Bio<textarea aria-label="Bio" rows={4} maxLength={500} value={form.bio} onChange={e=>setForm({ ...form,bio:e.target.value })} className={`${field} py-3`}/></label>
    <label className="block text-sm font-medium">Avatar<input type="file" accept={journeyPhotoAccept} className="mt-2 block w-full min-w-0 text-sm" onChange={e=>{ void upload(e.target.files?.[0]); e.target.value=''; }}/></label>
    <p className="text-xs text-stone-500">Photos up to 15 MB are prepared automatically. HEIC/HEIF needs browser support.</p>
    {form.avatar_path && <button type="button" className="min-h-11 text-sm underline" onClick={()=>{ setForm({ ...form,avatar_path:null }); setPreview(null); }}>Remove avatar</button>}
    <button type="submit" className="min-h-12 rounded-full bg-brand px-6 text-sm font-semibold text-white">{busy ? 'Saving…' : 'Save Profile'}</button>
    </fieldset>{photoStage && <p role="status" className="text-sm font-semibold text-brand">{photoStage === 'optimizing' ? 'Optimizing photo…' : 'Uploading photo…'}</p>}{message && <p role="status" className="text-sm text-brand">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</form>;
}
