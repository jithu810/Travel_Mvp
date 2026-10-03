import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/env';
import { accountJourneys,publicProfile } from '@/lib/profile/queries';
import { CreatorAvatar } from '@/components/journey/creator-avatar';
import { JourneyGrid } from '@/components/journey/journey-grid';
import { publicProfileSeo } from '@/lib/seo/public-data';
import { publicMetadata, privateMetadata, plainDescription } from '@/lib/seo/metadata';
import { siteUrl } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/json-ld';
import { EmptyState } from '@/components/ui/empty-state';

export async function generateMetadata({ params,searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }) {
  if ((await searchParams).tab === 'drafts') return privateMetadata('Private profile drafts');
  const profile = await publicProfileSeo((await params).username).catch(() => null);
  return profile ? publicMetadata(`Travel Journeys by @${profile.username}`, plainDescription(profile.bio || '', `Explore published travel journeys shared by ${profile.display_name || `@${profile.username}`} on Journey.`), `/profile/${encodeURIComponent(profile.username)}`) : privateMetadata('Profile not found');
}
export default async function PublicProfilePage({ params,searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string; updated?: string; deleted?: string }> }) {
  if (!getSupabaseConfig()) notFound();
  const client = await createClient();
  const { username } = await params;
  const profile = await publicProfile(client,username);
  if (!profile) notFound();
  const { data: { user },error } = await client.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw new Error('Unable to verify your session.');
  const owner = user?.id === profile.id;
  const query = await searchParams;
  const drafts = owner && query.tab === 'drafts';
  const journeys = await accountJourneys(client,drafts ? 'drafts' : 'published',profile.id);
  return <div className="space-y-8">
    {!drafts && query.tab !== 'drafts' && siteUrl('/') && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'ProfilePage',
      url: siteUrl(`/profile/${encodeURIComponent(profile.username)}`), name: `Travel Journeys by @${profile.username}`,
      mainEntity: { '@type': 'Person', name: profile.display_name || profile.username, alternateName: `@${profile.username}`, ...(profile.bio ? { description: profile.bio } : {}) },
    }} />}
    {owner && (query.updated || query.deleted) && <p role="status" className="text-sm text-brand">{query.deleted ? 'Journey deleted. Remixed copies are unaffected.' : 'Profile saved.'}</p>}
    <section className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6">
      <CreatorAvatar name={profile.display_name || profile.username} src={profile.avatar_path}/>
      <h1 className="text-3xl font-semibold">{profile.display_name || profile.username}</h1>
      <p className="text-sm text-stone-500">@{profile.username} · {profile.published_count} published {profile.published_count === 1 ? 'journey' : 'journeys'}</p>
      {profile.bio && <p className="max-w-2xl whitespace-pre-wrap break-words text-stone-600">{profile.bio}</p>}
      {owner && <Link href="/profile/edit" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Edit Profile</Link>}
    </section>
    <nav aria-label="Profile journeys" className="flex gap-3">
      <Link aria-current={!drafts ? 'page' : undefined} href={`/profile/${profile.username}`} className={`min-h-11 rounded-full px-5 py-3 text-sm ${!drafts ? 'bg-brand text-white' : 'bg-stone-100'}`}>Published</Link>
      {owner && <Link aria-current={drafts ? 'page' : undefined} href={`/profile/${profile.username}?tab=drafts`} className={`min-h-11 rounded-full px-5 py-3 text-sm ${drafts ? 'bg-brand text-white' : 'bg-stone-100'}`}>Drafts</Link>}
    </nav>
    {journeys.length ? <JourneyGrid journeys={journeys}/> : <EmptyState title={drafts ? 'No drafts yet.' : 'No published journeys yet.'}><p>{owner ? 'Your journeys will appear here. Create your first journey and share your route with other travelers.' : 'This traveler hasn’t shared a journey yet. Explore other destinations and routes in the meantime.'}</p><Link href={owner ? '/create' : '/explore'} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-white">{owner ? 'Create Journey' : 'Explore Journeys'}</Link></EmptyState>}
  </div>;
}
