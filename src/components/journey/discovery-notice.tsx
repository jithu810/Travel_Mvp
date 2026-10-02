import type { DiscoveryResult } from "@/lib/discovery/types";

export function DiscoveryNotice({ result }: { result: DiscoveryResult }) {
  if (result.error) return <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{result.error}</p>;
  if (result.source === "demo") return <p className="text-sm text-stone-500">A little inspiration to get started. These are sample journeys, not real traveler posts.</p>;
  return null;
}
