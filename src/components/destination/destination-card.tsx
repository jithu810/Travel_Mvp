import Link from "next/link";
import { TravelImage } from "@/components/ui/travel-image";
import type { Destination } from "@/lib/discovery/destinations";

export function DestinationCard({ destination }: { destination: Destination }) {
  return <Link href={`/destination/${destination.slug}`} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-stone-200 sm:aspect-[3/4]">
    <TravelImage src={destination.image} alt={`${destination.name} travel inspiration`} sizes="(max-width: 640px) 45vw, 220px" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent" />
    <div className="absolute right-4 bottom-4 left-4 text-white"><p className="text-xs text-white/80">{destination.mood}</p><h3 className="mt-1 text-xl font-semibold">{destination.name} <span aria-hidden="true" className="float-right">↗</span></h3></div>
  </Link>;
}
