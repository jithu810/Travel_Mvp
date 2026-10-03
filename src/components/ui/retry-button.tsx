'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="mt-4 min-h-11 rounded-full border border-stone-300 bg-white px-5 font-semibold text-brand disabled:opacity-60">{pending ? 'Trying again…' : 'Try again'}</button>;
}
