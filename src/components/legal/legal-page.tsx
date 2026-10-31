import Link from 'next/link';
import type { ReactNode } from 'react';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return <article className="mx-auto max-w-3xl space-y-8 pb-6 text-sm leading-7 text-stone-700 sm:text-base">
    <header className="space-y-3 border-b border-stone-200 pb-6">
      <p className="text-xs font-semibold tracking-widest uppercase text-brand">Journey Buddy / Journey Creator</p>
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">{title}</h1>
      <p className="text-sm text-stone-500">Last updated <time dateTime="2026-10-31">31 October 2026</time></p>
      <nav aria-label="Legal information" className="flex flex-wrap gap-x-5 gap-y-1">
        <Link href="/privacy" className="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4">Privacy Policy</Link>
        <Link href="/terms" className="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-4">Terms of Service</Link>
      </nav>
    </header>
    {children}
    <section aria-labelledby="legal-contact" className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-5">
      <h2 id="legal-contact" className="text-xl font-semibold text-stone-900">Contact us</h2>
      <p>For support, privacy questions or account requests, email <a href="mailto:sreejith1043@gmail.com" className="break-all font-medium text-brand underline underline-offset-4">sreejith1043@gmail.com</a>. Please do not send passwords or sign-in codes.</p>
    </section>
  </article>;
}
