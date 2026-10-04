import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeading } from '@/components/ui/page-heading';
import { requireUser } from '@/lib/auth/session';
import { JourneyBuilder } from '@/components/journey/journey-builder';
import { resolveMedia } from '@/lib/journey/media';
import { uuidPattern, type JourneyInput } from '@/lib/journey/editor';
export const metadata: Metadata = { title: 'Create Journey', robots: { index: false, follow: false, noarchive: true } };
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ draft?: string; published?: string; edit?: string; copied?: string }> }) {
  const { draft,published,edit,copied } = await searchParams;
  const target = edit || draft || published;
  const { user,client } = await requireUser(target ? `/create?${edit ? 'edit' : draft ? 'draft' : 'published'}=${encodeURIComponent(target)}` : '/create');
  let initial: JourneyInput = { id: crypto.randomUUID(),title: '',description: '',destination_slug: '',traveler_type: '',duration_days: 1,cover_image_path: null,status: 'draft',updated_at: null,stops: [] };
  let images: Record<string,string> = {};
  if (target) {
    if (!uuidPattern.test(target)) notFound();
    let query = client.from('journeys').select('*').eq('id',target).eq('user_id',user.id);
    if (!edit) query = query.eq('status',draft ? 'draft' : 'published');
    const { data: journey,error } = await query.maybeSingle();
    if (error) throw new Error('Unable to load your draft. Please try again.');
    if (!journey) notFound();
    const { data: stops,error: stopError } = await client.from('journey_stops').select('*').eq('journey_id',target).order('sequence');
    if (stopError) throw new Error('Unable to load draft stops. Please try again.');
    initial = { id: journey.id,title: journey.title,description: journey.description || '',destination_slug: journey.destination_slug || '',destination_name: journey.destination_name,destination_latitude: journey.destination_latitude,destination_longitude: journey.destination_longitude,traveler_type: journey.traveler_type || '',duration_days: journey.duration_days,cover_image_path: journey.cover_image_path,status: journey.status,updated_at: journey.updated_at,
      stops: (stops || []).map((stop,index) => ({ id: stop.id,sequence: index + 1,name: stop.name,description: stop.description || '',latitude: stop.latitude,longitude: stop.longitude,mapbox_place_id: stop.mapbox_place_id,photo_path: stop.photo_path,rating: stop.rating,day_number: stop.day_number })) };
    images = Object.fromEntries(await resolveMedia(client,[initial.cover_image_path,...initial.stops.map(stop => stop.photo_path)]));
  }
  const { data: drafts,error: draftError } = await client.from('journeys').select('id,title,updated_at').eq('user_id',user.id).eq('status','draft').order('updated_at',{ ascending: false }).limit(20);
  return <>
    <PageHeading eyebrow={edit ? 'Edit Journey' : draft ? 'Edit draft' : published ? 'Journey published' : 'Create Journey'} title="Every route has a story." description="Add the places you visited, in the order you want to share them."/>
    {!target && <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-5"><h2 className="font-semibold">Your recent drafts</h2>{draftError ? <p className="mt-2 text-sm text-red-700">Drafts could not be loaded. Try refreshing.</p> : drafts?.length ? <ul className="mt-3 space-y-2">{drafts.map(item => <li key={item.id}><Link href={`/create?draft=${item.id}`} className="inline-flex min-h-11 items-center text-sm text-brand underline underline-offset-4">Continue: {item.title}</Link></li>)}</ul> : <p className="mt-2 text-sm text-stone-500">Saved drafts will appear here so you can finish them later.</p>}</section>}
    {draft && <Link href="/create" className="mb-5 inline-flex min-h-11 items-center text-sm underline">Start a new journey</Link>}
    {copied && draft && <p role="status" className="mb-5 rounded-2xl bg-[#e7eedf] p-4 text-sm text-brand">Private copy created. Edit your version below; the original journey is unchanged.</p>}
    <JourneyBuilder key={initial.id} initial={initial} images={images} editingPublished={!!edit && initial.status === 'published'}/>
  </>;
}
