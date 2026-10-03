'use client';

import Image from 'next/image';
import { useState } from 'react';

// A missing or expired stop photo never becomes unrelated stock photography.
export function StopPhoto({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="py-4 text-sm text-stone-500">This stop photo is unavailable.</p>;
  return <div className="relative mt-5 aspect-[16/10] overflow-hidden rounded-2xl bg-stone-100"><Image src={src} alt={name} fill sizes="(max-width: 768px) 100vw, 720px" unoptimized={src.startsWith('https:')} onError={() => setFailed(true)} className="object-cover" /></div>;
}
