"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section role="alert" className="rounded-3xl border border-stone-200 bg-white p-8"><h1 className="text-2xl font-semibold">This journey could not load.</h1><p className="mt-3 text-stone-600">Please try again in a moment.</p><div className="mt-6 flex flex-wrap gap-4"><button onClick={reset} className="min-h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white">Try again</button><Link href="/explore" className="inline-flex min-h-11 items-center text-sm font-medium underline">Back to Explore</Link></div></section>;
}
