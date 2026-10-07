import { SaveJourneyButton } from './save-journey-button';
import { CreatorAvatar } from "./creator-avatar";
import Link from "next/link";
import { getDestination } from "@/lib/discovery/destinations";
import type { Journey } from "@/lib/discovery/types";
import { TravelImage } from "@/components/ui/travel-image";

export function JourneyCard({ journey,removable=false,matchingStops }: { journey: Journey; removable?: boolean; matchingStops?: string[] }) {
  const destination = getDestination(journey.destinationSlug);
  return <article data-testid="journey-card" data-traveler={journey.travelerType} className="group overflow-hidden rounded-3xl border border-stone-200 bg-white motion-safe:transition-shadow motion-safe:duration-200 hover:shadow-lg hover:shadow-stone-200/60">
    <Link href={journey.status === 'draft' ? `/create?draft=${journey.id}` : `/journey/${journey.id}`} aria-label={`Open journey: ${journey.title}`} className="block">
      <div className="relative aspect-[4/3] bg-stone-200">
        <TravelImage src={journey.coverImage} alt={`${journey.destinationName || destination?.name || "Travel"} journey cover`} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <span className="absolute top-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium capitalize">{journey.travelerType}</span>
        {journey.isDemo && <span className="absolute right-4 bottom-4 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-brand">Demo journey</span>}
      </div>
      <div className="p-5 pb-3">
        <p className="break-words text-xs font-semibold tracking-wider text-brand uppercase">{journey.destinationName || destination?.name || "Journey"}{journey.status === "draft" && " · Draft"}</p>
        <h3 className="mt-2 break-words text-xl leading-snug font-semibold tracking-tight">{journey.title}</h3>
        <p className="mt-3 text-sm text-stone-500">{journey.durationDays > 0 && <>{journey.durationDays} {journey.durationDays === 1 ? "day" : "days"}<span className="mx-2" aria-hidden="true">·</span></>}{journey.stops.length} {journey.stops.length === 1 ? "stop" : "stops"}</p>
        {!!matchingStops?.length && <p className="mt-2 text-xs leading-5 text-brand">Includes {matchingStops.slice(0, 2).join(', ')}{matchingStops.length > 2 ? ` +${matchingStops.length - 2} stops` : ''}</p>}
        <p className="mt-4 flex min-h-8 items-center justify-between text-sm font-semibold text-brand">{journey.status === "draft" ? "Continue editing" : "View Journey"}<span aria-hidden="true">↗</span></p>
      </div>
    </Link>
    <div className="mx-5 mb-5 flex items-center justify-between gap-2 border-t border-stone-100 pt-4">
      <div className="flex min-w-0 items-center gap-2">
        <CreatorAvatar name={journey.creatorName} src={journey.creatorAvatar}/>
        {journey.creatorUsername ? <Link href={`/profile/${encodeURIComponent(journey.creatorUsername)}`} className="flex min-h-11 min-w-0 items-center text-xs text-stone-600 underline"><span className="truncate">{journey.creatorName}</span></Link> : <span className="truncate text-xs text-stone-600">{journey.creatorName}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-stone-500">
        <span aria-label={`${journey.likes} likes`} className="text-xs"><span aria-hidden="true">♡ </span>{journey.likes}</span>
        {journey.status !== 'draft' && <SaveJourneyButton id={journey.id} title={journey.title} initialSaved={journey.saved} removable={removable}/>}

      </div>
    </div>
  </article>;
}
