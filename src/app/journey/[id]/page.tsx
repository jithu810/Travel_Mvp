import { getJourneyLineage } from '@/lib/journey/lineage-queries';
import { JourneyOriginSection, InspiredJourneys } from '@/components/journey/journey-lineage';
import { OwnerActions } from '@/components/journey/owner-actions';
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJourneyDetail } from "@/lib/journey/detail";
import { getDestination } from "@/lib/discovery/destinations";
import { TravelImage } from "@/components/ui/travel-image";
import { JourneyRoute } from "@/components/journey/journey-route";
import { JourneyActions } from "@/components/journey/journey-actions";
import { CreatorAvatar } from "@/components/journey/creator-avatar";
import { JourneySnapshot } from '@/components/journey/journey-snapshot';
import { journeyIntelligence } from '@/lib/journey/journey-intelligence';
import { publicJourneySeo } from '@/lib/seo/public-data';
import { publicMetadata, privateMetadata, plainDescription, seoImage } from '@/lib/seo/metadata';
import { siteUrl } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/json-ld';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await publicJourneySeo(id).catch(() => null);
  if (!row) return privateMetadata();
  const destination = row.destination_name || getDestination(row.destination_slug)?.name || 'Travel';
  const traveler = row.traveler_type ? row.traveler_type[0].toUpperCase() + row.traveler_type.slice(1) : '';
  return publicMetadata(`${row.title} — ${traveler} Journey in ${destination}`, plainDescription(row.description || '', `Explore this ${traveler.toLowerCase()} journey through ${destination}, following the creator's ordered stops.`), `/journey/${encodeURIComponent(id)}`, row.cover_image_path, !row.is_demo);
}

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journey = await getJourneyDetail(id);
  if (!journey) notFound();
  const lineage = await getJourneyLineage(journey);
  const owner = !!journey.viewerId && journey.creatorId === journey.viewerId;
  const destination = getDestination(journey.destinationSlug);
  const destinationName = journey.destinationName || destination?.name;
  const publicRow = journey.status === 'published' ? await publicJourneySeo(id).catch(() => null) : null;
  return <article className="space-y-8">
    {publicRow && !publicRow.is_demo && siteUrl('/') && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'CreativeWork',
      name: publicRow.title, description: plainDescription(publicRow.description || '', 'A shared travel journey.'),
      url: siteUrl(`/journey/${encodeURIComponent(id)}`), image: seoImage(publicRow.cover_image_path),
      author: { '@type': 'Person', name: publicRow.creator_name || 'Traveler', ...(publicRow.creator_username ? { url: siteUrl(`/profile/${encodeURIComponent(publicRow.creator_username)}`) } : {}) },
      about: { '@type': 'Place', name: publicRow.destination_name || getDestination(publicRow.destination_slug)?.name || publicRow.destination_slug },
      ...(publicRow.traveler_type ? { audience: { '@type': 'Audience', audienceType: publicRow.traveler_type } } : {}),
    }} />}
    <Link href={destination ? `/destination/${journey.destinationSlug}` : "/explore"} className="inline-flex min-h-11 items-center text-sm font-medium text-stone-500">← Explore {destination?.name || "journeys"}</Link>
    <header className="max-w-3xl space-y-4 break-words">
      {journey.creatorUsername ? <Link href={`/profile/${encodeURIComponent(journey.creatorUsername)}`} className="inline-flex min-h-12 max-w-full items-center gap-3"><CreatorAvatar name={journey.creatorName} src={journey.creatorAvatar}/><span className="min-w-0"><span className="block text-sm font-semibold">{journey.creatorName}</span><span className="block text-xs text-stone-500">@{journey.creatorUsername}</span></span></Link> : <div className="inline-flex min-h-12 items-center gap-3"><CreatorAvatar name={journey.creatorName} src={journey.creatorAvatar}/><span className="text-sm font-semibold">{journey.creatorName}</span></div>}
      <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{journey.title}</h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-600">
        {destinationName && (destination ? <Link href={`/destination/${journey.destinationSlug}`} className="inline-flex min-h-11 items-center font-medium text-brand">{destinationName} · {destination.region}</Link> : <span>{destinationName}</span>)}
        {journey.travelerType && <span className="capitalize">{journey.travelerType}</span>}
        {journey.isDemo && <span className="text-xs text-amber-800">Demo journey</span>}
        {journey.status === "draft" && <span className="text-xs font-semibold text-amber-800">Private draft · Only you</span>}
      </div>
    </header>

    <JourneyRoute stops={journey.stops} controls={<JourneyActions key={`${id}:${journey.viewerId || "anonymous"}`} id={id} title={journey.title} isPublic={journey.status === "published"} viewerId={journey.viewerId} initialLikes={journey.likes} initialLiked={journey.liked} initialSaved={journey.saved}/>}>
    <section aria-label="Journey summary" className="mx-auto grid max-w-4xl items-start gap-5 sm:grid-cols-[1fr_240px]">
      <div className="min-w-0 space-y-4">
        <JourneySnapshot intelligence={journeyIntelligence(journey)}/>
        {journey.description && <p className="whitespace-pre-line break-words text-base leading-8 text-stone-600 sm:text-lg">{journey.description}</p>}
      </div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-stone-200"><TravelImage src={journey.coverImage} alt={`${destinationName || "Travel"} journey cover`} sizes="(max-width: 640px) 100vw, 240px" priority/></div>
    </section>
    {owner && <OwnerActions id={id}/>}
    {journey.status === "draft" && <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">This journey is private. It is not visible in public discovery. <Link href={`/create?draft=${id}`} className="font-semibold underline">Continue editing your draft →</Link></p>}

    {journey.isDemo && <p className="rounded-2xl bg-[#e7eedf] p-4 text-sm leading-6">This is a sample journey created for the Journey demo, not a real user post. Stops and approximate map positions illustrate a route; they are not verified travel instructions.</p>}
    </JourneyRoute>
    {lineage.source && <JourneyOriginSection source={lineage.source} root={lineage.root}/>}
    <section aria-label="About the creator" className="border-t border-stone-200 pt-8">
      <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">About the creator</p>
      <div className="mt-5 flex flex-wrap items-center gap-4"><CreatorAvatar name={journey.creatorName} src={journey.creatorAvatar}/><div className="min-w-0 max-w-full break-words"><h2 className="text-xl font-semibold">{journey.creatorName}</h2>{journey.creatorUsername && <p className="mt-1 text-sm text-stone-500">@{journey.creatorUsername}</p>}</div>{journey.creatorUsername && <Link href={`/profile/${encodeURIComponent(journey.creatorUsername)}`} className="inline-flex min-h-11 items-center rounded-full border border-stone-200 bg-white px-5 text-sm font-semibold text-brand">View Profile</Link>}</div>
    </section>
    <InspiredJourneys journeys={lineage.inspired}/>
    <Link href={destination ? `/destination/${journey.destinationSlug}` : "/explore"} className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-sm font-semibold text-white">More journeys {destination ? `through ${destination.name}` : "to explore"} ↗</Link>
  </article>;
}
