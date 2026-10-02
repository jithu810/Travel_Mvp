import { OwnerActions } from '@/components/journey/owner-actions';
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJourneyDetail } from "@/lib/journey/detail";
import { getDestination } from "@/lib/discovery/destinations";
import { TravelImage } from "@/components/ui/travel-image";
import { JourneyRoute } from "@/components/journey/journey-route";
import { JourneyActions } from "@/components/journey/journey-actions";
import { CreatorAvatar } from "@/components/journey/creator-avatar";
import { publicJourneySeo } from '@/lib/seo/public-data';
import { publicMetadata, privateMetadata, plainDescription, seoImage } from '@/lib/seo/metadata';
import { siteUrl } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/json-ld';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await publicJourneySeo(id).catch(() => null);
  if (!row) return privateMetadata();
  const destination = getDestination(row.destination_slug)?.name || 'Travel';
  const traveler = row.traveler_type ? row.traveler_type[0].toUpperCase() + row.traveler_type.slice(1) : '';
  return publicMetadata(`${row.title} — ${traveler} Journey in ${destination}`, plainDescription(row.description || '', `Explore this ${traveler.toLowerCase()} journey through ${destination}, following the creator's ordered stops.`), `/journey/${encodeURIComponent(id)}`, row.cover_image_path, !row.is_demo);
}

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journey = await getJourneyDetail(id);
  if (!journey) notFound();
  const source = journey.copiedFrom ? await getJourneyDetail(journey.copiedFrom).catch(() => null) : null;
  const owner = !!journey.viewerId && journey.creatorId === journey.viewerId;
  const destination = getDestination(journey.destinationSlug);
  const publicRow = journey.status === 'published' ? await publicJourneySeo(id).catch(() => null) : null;
  return <article className="space-y-8">
    {publicRow && !publicRow.is_demo && siteUrl('/') && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'CreativeWork',
      name: publicRow.title, description: plainDescription(publicRow.description || '', 'A shared travel journey.'),
      url: siteUrl(`/journey/${encodeURIComponent(id)}`), image: seoImage(publicRow.cover_image_path),
      author: { '@type': 'Person', name: publicRow.creator_name || 'Traveler', ...(publicRow.creator_username ? { url: siteUrl(`/profile/${encodeURIComponent(publicRow.creator_username)}`) } : {}) },
      about: { '@type': 'Place', name: getDestination(publicRow.destination_slug)?.name || publicRow.destination_slug },
      ...(publicRow.traveler_type ? { audience: { '@type': 'Audience', audienceType: publicRow.traveler_type } } : {}),
    }} />}
    <Link href={destination ? `/destination/${journey.destinationSlug}` : "/explore"} className="inline-flex min-h-11 items-center text-sm font-medium text-stone-500">← Explore {destination?.name || "journeys"}</Link>
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-stone-200 sm:aspect-[16/7]"><TravelImage src={journey.coverImage} alt={`${destination?.name || "Travel"} journey cover`} sizes="(max-width: 1100px) 100vw, 1100px" priority/></div>
    <header className="max-w-3xl space-y-5">
      <div className="flex flex-wrap gap-2">{destination && <Link href={`/destination/${journey.destinationSlug}`} className="rounded-full bg-[#e7eedf] px-3 py-2 text-xs font-semibold text-brand">{destination.name}</Link>}{journey.travelerType && <span className="rounded-full bg-stone-100 px-3 py-2 text-xs capitalize">{journey.travelerType}</span>}{journey.isDemo && <span className="rounded-full bg-amber-50 px-3 py-2 text-xs text-amber-800">Demo journey</span>}{journey.status === "draft" && <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Private draft · Only you</span>}</div>
      <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">{journey.title}</h1>
      <p className="text-sm text-stone-500">{journey.durationDays} {journey.durationDays === 1 ? "day" : "days"} · {journey.stops.length} stops</p>
      {journey.creatorUsername ? <Link href={`/profile/${encodeURIComponent(journey.creatorUsername)}`} className="inline-flex min-h-12 items-center gap-3"><CreatorAvatar name={journey.creatorName} src={journey.creatorAvatar}/><span><span className="block text-sm font-semibold">{journey.creatorName}</span><span className="block text-xs text-stone-500">@{journey.creatorUsername}</span></span></Link> : <div className="inline-flex min-h-12 items-center gap-3"><CreatorAvatar name={journey.creatorName} src={journey.creatorAvatar}/><span className="text-sm font-semibold">{journey.creatorName}</span></div>}

    </header>
    {owner && <OwnerActions id={id}/>}
    <JourneyActions key={`${id}:${journey.viewerId || "anonymous"}`} id={id} title={journey.title} isPublic={journey.status === "published"} viewerId={journey.viewerId} initialLikes={journey.likes} initialLiked={journey.liked} initialSaved={journey.saved}/>
    {journey.status === "draft" && <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">This journey is private. It is not visible in public discovery. <Link href={`/create?draft=${id}`} className="font-semibold underline">Continue editing your draft →</Link></p>}
    {journey.copiedFrom && <p className="text-sm text-stone-500">{source ? <>Remixed from <Link href={`/journey/${source.id}`} className="underline">{source.title}</Link></> : 'Remixed from a journey that is no longer publicly available.'}</p>}
    {journey.isDemo && <p className="rounded-2xl bg-[#e7eedf] p-4 text-sm leading-6">This is a sample journey created for the Journey demo, not a real user post. Stops and approximate map positions illustrate a route; they are not verified travel instructions.</p>}
    <p className="max-w-3xl text-lg leading-8 text-stone-600">{journey.description || "No journey description has been added yet."}</p>
    <JourneyRoute stops={journey.stops}/>
    <Link href={destination ? `/destination/${journey.destinationSlug}` : "/explore"} className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-sm font-semibold text-white">More journeys {destination ? `through ${destination.name}` : "to explore"} ↗</Link>
  </article>;
}
