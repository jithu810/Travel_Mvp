'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const storageKey = 'journeycreator:welcome:v1';
let seenThisVisit = false;

export function WelcomeCard() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Read browser storage after hydration, leaving the public content's first render intact.
    const timer = setTimeout(() => {
      if (seenThisVisit) return;
      seenThisVisit = true;
      try {
        if (localStorage.getItem(storageKey)) return;
        localStorage.setItem(storageKey, 'seen');
      } catch { /* In-memory state still prevents repeat prompts when storage is unavailable. */ }
      setVisible(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(storageKey, 'dismissed'); } catch { /* Browser storage is optional. */ }
  }

  if (!visible) return null;
  return <aside aria-labelledby="welcome-heading" className="relative rounded-3xl bg-[#e7eedf] p-5 sm:p-7">
    <button type="button" aria-label="Dismiss welcome" onClick={dismiss} className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-white/70">×</button>
    <div className="pr-10"><p className="text-xs font-semibold tracking-wider text-brand uppercase">A place to begin</p><h2 id="welcome-heading" className="mt-2 text-xl font-semibold sm:text-2xl">Welcome to Journey Creator</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-stone-700">Discover journeys shared by travelers. Explore a destination, follow a creator’s ordered stops, or remix a route into your own trip.</p></div>
    <div className="mt-5 flex flex-wrap items-center gap-3"><Link href="/explore" onClick={dismiss} className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white">Explore Journeys</Link><button type="button" onClick={dismiss} className="min-h-11 px-3 text-sm font-medium text-brand underline">Got it</button></div>
  </aside>;
}
