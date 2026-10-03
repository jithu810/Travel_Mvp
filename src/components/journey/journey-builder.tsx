"use client";
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { destinations, getDestination } from '@/lib/discovery/destinations';
import { JourneyMap } from '@/components/map/journey-map';
import { PlaceSearch, type Place } from '@/components/map/place-search';
import { TravelImage } from '@/components/ui/travel-image';
import { validateJourney, type EditorStop, type JourneyInput } from '@/lib/journey/editor';
import { imageTypes, maxImageBytes } from '@/lib/journey/image-validation';
import { createStopId } from '@/lib/journey/stop-id';
import { shareJourneyUrl } from '@/lib/seo/site';
import type { JourneyStop } from '@/lib/journey/types';

const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3';
type Saved = { id: string; status: 'draft' | 'published'; updated_at: string };
export function JourneyBuilder({ initial, images = {}, editingPublished = false }: { initial: JourneyInput; images?: Record<string,string>; editingPublished?: boolean }) {
  const [editing,setEditing] = useState(editingPublished);
  const [form,setForm] = useState(initial);
  const [previews,setPreviews] = useState(images);
  const [selected,setSelected] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const destination = getDestination(form.destination_slug);
  // Typing descriptions/ratings must not recreate the existing Mapbox instance.
  const geometry = JSON.stringify(form.stops.map(stop => ({ id: stop.id,sequence: stop.sequence,name: stop.name,latitude: stop.latitude,longitude: stop.longitude,description: '',photo: null,rating: null,dayNumber: null })));
  const mapStops = useMemo(() => JSON.parse(geometry) as JourneyStop[],[geometry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  },[dirty]);
  function change(patch: Partial<JourneyInput>) { setForm(current => ({ ...current,...patch })); setDirty(true); setMessage(''); }
  function editStop(id: string,patch: Partial<EditorStop>) { change({ stops: form.stops.map(stop => stop.id === id ? { ...stop,...patch } : stop) }); }
  function reorder(stops: EditorStop[]) { change({ stops: stops.map((stop,index) => ({ ...stop,sequence: index + 1 })) }); }
  function move(index: number,offset: number) {
    const stops = [...form.stops];
    [stops[index],stops[index + offset]] = [stops[index + offset],stops[index]];
    reorder(stops);
  }
  function add(place: Place) {
    if (form.stops.some(stop => (place.mapboxId && stop.mapbox_place_id === place.mapboxId) || (stop.latitude === place.latitude && stop.longitude === place.longitude))) return false;
    if (form.stops.length >= 50) { setError('A journey can have up to 50 stops.'); return false; }
    const stop: EditorStop = { id: createStopId(),sequence: form.stops.length + 1,name: place.name,description: '',latitude: place.latitude,longitude: place.longitude,mapbox_place_id: place.mapboxId,photo_path: null,rating: null,day_number: null };
    change({ stops: [...form.stops,stop] }); setSelected(stop.id); setError(''); return true;
  }
  async function persist(input: JourneyInput): Promise<Saved> {
    const invalid = validateJourney(input);
    if (invalid) throw new Error(invalid);
    const response = await fetch('/api/journeys',{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Journey could not be saved.');
    if (!result.id || !result.updated_at) throw new Error('The save response was incomplete. Reload to check your draft.');
    setForm({ ...input,updated_at: result.updated_at }); setDirty(false);
    window.history.replaceState(null,'',`/create?${input.status === 'draft' ? 'draft' : 'published'}=${result.id}`);
    return result;
  }
  async function save(status: 'draft' | 'published') {
    setBusy(true); setError(''); setMessage('');
    try { await persist({ ...form,status }); if (status === 'published') setEditing(false); setMessage(status === 'published' ? 'Your journey is published.' : 'Draft saved. Only you can see it.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function upload(file: File | undefined,stopId?: string) {
    if (!file) return;
    setError(''); setMessage('');
    if (file.size > maxImageBytes) { setError('Image must be 15 MB or smaller.'); return; }
    if (!imageTypes.includes(file.type) || !file.size) { setError('Choose a JPEG, PNG or WebP image.'); return; }
    setBusy(true);
    try {
      const draft = { ...form };
      const saved = await persist(draft);
      if (editing) window.history.replaceState(null,'',`/create?edit=${form.id}`);
      const data = new FormData(); data.set('file',file); if (stopId) data.set('stop',stopId);
      const response = await fetch(`/api/journeys/${form.id}/images`,{ method: 'POST',body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Photo upload failed. Your draft is saved.');
      const updated = { ...draft,updated_at: saved.updated_at,...(stopId ? { stops: draft.stops.map(stop => stop.id === stopId ? { ...stop,photo_path: result.path } : stop) } : { cover_image_path: result.path }) };
      setForm(updated); setDirty(true);
      if (result.preview) setPreviews(current => ({ ...current,[result.path]: result.preview }));
      await persist(updated); if (editing) window.history.replaceState(null,'',`/create?edit=${form.id}`); setMessage('Photo uploaded and draft saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed. You can save without a photo.'); }
    finally { setBusy(false); }
  }
  const photo = (path: string | null) => path ? previews[path] || (path.startsWith('/images/') || path.startsWith('https:') ? path : null) : null;
  async function share() {
    const url = shareJourneyUrl(form.id,window.location.origin);
    try {
      if (navigator.share) { try { await navigator.share({ title: form.title,url }); return; } catch (cause) { if (cause instanceof Error && cause.name === 'AbortError') return; } }
      await navigator.clipboard.writeText(url); setMessage('Public journey link copied.');
    } catch { setError('Sharing is unavailable. Copy the public URL below.'); }
  }
  if (form.status === 'published' && !editing) return <section className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6"><p className="text-sm font-semibold text-brand">Journey published</p><h2 className="text-3xl font-semibold">{form.title}</h2><p className="text-stone-600">Your route is now public and appears in {destination?.name} discovery.</p><label className="block text-sm">Public journey URL<input readOnly value={typeof window === 'undefined' ? `/journey/${form.id}` : shareJourneyUrl(form.id,window.location.origin)} className={inputClass}/></label><div className="flex flex-wrap gap-3"><Link href={`/journey/${form.id}`} className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-sm font-semibold text-white">View Journey</Link><button type="button" onClick={share} className="min-h-12 rounded-full border border-stone-200 px-6 text-sm">Share Journey</button><Link href="/create" className="inline-flex min-h-12 items-center px-3 text-sm underline">Create another journey</Link></div>{message && <p role="status" className="text-sm text-brand">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</section>;
  return <form className="space-y-6" onSubmit={event => event.preventDefault()}>
    <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
      <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-semibold">Journey information</h2><div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">Journey title<input value={form.title} required maxLength={200} onChange={event => change({ title: event.target.value })} placeholder="3 Days in Varkala" className={inputClass}/></label>
        <label className="block text-sm font-medium">Destination<select required value={form.destination_slug} onChange={event => change({ destination_slug: event.target.value })} className={inputClass}><option value="">Select a destination</option>{destinations.map(dest => <option key={dest.slug} value={dest.slug}>{dest.name}</option>)}</select></label>
        <label className="block text-sm font-medium">Traveler type<select required value={form.traveler_type} onChange={event => change({ traveler_type: event.target.value })} className={inputClass}><option value="">Select a traveler type</option>{['solo','couple','friends','family'].map(type => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
        <label className="block text-sm font-medium">Duration in days<input type="number" min={1} max={365} value={form.duration_days} onChange={event => change({ duration_days: Number(event.target.value) })} className={inputClass}/></label>
        <label className="block text-sm font-medium sm:col-span-2">Description<textarea rows={4} maxLength={5000} value={form.description} onChange={event => change({ description: event.target.value })} className={`${inputClass} py-3`}/></label>
        <div className="space-y-3 sm:col-span-2"><label className="block text-sm font-medium">Cover image (optional)<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-stone-100 file:px-4" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/></label><p className="text-xs text-stone-500">JPEG, PNG or WebP, up to 15 MB. Uploading saves your journey first.</p>{photo(form.cover_image_path) && <div className="relative aspect-video max-w-md overflow-hidden rounded-xl"><TravelImage src={photo(form.cover_image_path)!} alt="Journey cover preview" sizes="400px"/></div>}{form.cover_image_path && <button type="button" onClick={() => change({ cover_image_path: null })} className="min-h-11 text-sm underline">Remove cover image</button>}</div>
      </div></section>
      <section className="space-y-5 rounded-3xl border border-stone-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Your stops</h2><span className="rounded-full bg-stone-100 px-3 py-2 text-xs font-medium">{form.stops.length} / 50 places</span><p className="w-full text-sm text-stone-500">Add places in the order you visited. Use ↑ ↓ to adjust your route.</p></div>
        <PlaceSearch onAdd={add} latitude={destination?.latitude || 8.74} longitude={destination?.longitude || 76.72} disabled={busy || form.stops.length >= 50}/>
        {!form.stops.length && <p className="rounded-xl bg-stone-50 p-5 text-sm text-stone-500">No stops yet. Search above and select your first place.</p>}
        <ol className="space-y-4">{form.stops.map((stop,index) => <li key={stop.id} data-testid="editor-stop" data-sequence={stop.sequence} className="space-y-4 rounded-2xl border border-stone-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{index + 1}. {stop.name}</h3><div className="flex gap-2"><button type="button" disabled={index === 0 || busy} aria-label={`Move ${stop.name} up`} onClick={() => move(index,-1)} className="h-11 w-11 rounded-full bg-stone-100 disabled:opacity-30">↑</button><button type="button" disabled={index === form.stops.length - 1 || busy} aria-label={`Move ${stop.name} down`} onClick={() => move(index,1)} className="h-11 w-11 rounded-full bg-stone-100 disabled:opacity-30">↓</button><button type="button" aria-label={`Remove ${stop.name}`} onClick={() => { reorder(form.stops.filter(item => item.id !== stop.id)); if (selected === stop.id) setSelected(null); }} className="min-h-11 px-2 text-sm text-red-700">Remove</button></div></div>
          {stop.latitude == null && <p className="text-xs text-stone-500">Replace this saved stop with a search result before publishing.</p>}
          <details><summary className="min-h-11 cursor-pointer text-sm font-medium text-stone-600">Details &amp; photo</summary><div className="space-y-4 pt-3">
          <label className="block text-sm">Stop description<textarea maxLength={1000} rows={2} value={stop.description} onChange={event => editStop(stop.id,{ description: event.target.value })} className={`${inputClass} py-3`}/></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm">Day<select value={stop.day_number ?? ''} onChange={event => editStop(stop.id,{ day_number: event.target.value ? Number(event.target.value) : null })} className={inputClass}><option value="">Not specified</option>{Array.from({ length: Math.min(365,Math.max(1,form.duration_days || 1)) },(_,day) => <option key={day} value={day + 1}>Day {day + 1}</option>)}</select></label><label className="text-sm">Rating (optional)<input type="number" min={0} max={5} step={0.1} value={stop.rating ?? ''} onChange={event => editStop(stop.id,{ rating: event.target.value ? Number(event.target.value) : null })} className={inputClass}/></label></div>
          <label className="block text-sm">Stop photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full min-w-0 text-sm file:mr-2 file:min-h-11 file:rounded-full file:border-0 file:bg-stone-100 file:px-3" onChange={event => { void upload(event.target.files?.[0],stop.id); event.target.value = ''; }}/></label>{photo(stop.photo_path) && <div className="relative aspect-video max-w-sm overflow-hidden rounded-xl"><TravelImage src={photo(stop.photo_path)!} alt={`${stop.name} photo preview`} sizes="350px"/></div>}{stop.photo_path && <button type="button" onClick={() => editStop(stop.id,{ photo_path: null })} className="min-h-11 text-sm underline">Remove stop photo</button>}
          </div></details>
        </li>)}</ol>
      </section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Map preview</h2><JourneyMap stops={mapStops} selectedId={selected} onSelect={setSelected}/></section>
    </fieldset>
    <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg md:bottom-3"><p className="text-xs text-stone-500">{busy ? 'Saving… Keep this page open.' : dirty ? 'Unsaved changes. Save before leaving.' : form.updated_at ? (editing ? 'Your published journey is saved.' : 'Your draft is saved privately.') : 'Drafts are private. Publish when your route is ready.'}</p><div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => save(editing ? 'published' : 'draft')} className="min-h-12 flex-1 rounded-full border border-stone-300 px-5 text-sm font-semibold disabled:opacity-50">{editing ? 'Save Changes' : 'Save Draft'}</button>{!editing && <button type="button" disabled={busy} onClick={() => save('published')} className="min-h-12 flex-1 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50">Publish Journey</button>}</div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{message && <p role="status" className="text-sm text-brand">{message}</p>}</div>
  </form>;
}
