"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountMenu } from '@/components/auth/account-menu';

type NavIconName = 'home' | 'explore' | 'create' | 'saved' | 'profile';
function NavIcon({ name }: { name: NavIconName }) {
  const paths = {
    home: 'm3 10 9-7 9 7v10H7V10m3 10v-7h4v7',
    explore: 'm16 8-3 5-5 3 3-5 5-3',
    create: 'M12 5v14M5 12h14',
    saved: 'M6 3h12v18l-6-4-6 4V3Z',
    profile: 'M5 21v-2a7 7 0 0 1 14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  };
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{name === 'explore' && <circle cx="12" cy="12" r="9" />}<path d={paths[name]} /></svg>;
}

export function Header() {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const mobileLinks: { href: string; label: string; icon: NavIconName }[] = [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/explore', label: 'Explore', icon: 'explore' },
    { href: '/create', label: 'Create', icon: 'create' },
    { href: '/saved', label: 'Saved', icon: 'saved' },
    { href: authenticated ? '/profile' : '/login', label: authenticated ? 'Profile' : 'Login', icon: 'profile' },
  ];
  const current = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)) || (href === '/explore' && (pathname.startsWith('/destination/') || pathname.startsWith('/journey/') || pathname.startsWith('/travel/')));
  return <>
    <header className="border-b border-stone-200/80 bg-white">
      <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link href="/" aria-label="Journey home" className="flex min-h-11 items-center gap-2.5 text-sm leading-tight font-bold tracking-tight sm:text-xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="h-6 w-6"><path d="M5 25 15 5l12 20H5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="m10 15 5 4 5-7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
          <span>Journey <span className="block font-normal sm:inline">Creator</span></span>
        </Link>
        <nav aria-label="Main navigation" className="ml-6 hidden flex-1 items-center gap-6 md:flex">
          <Link href="/explore" aria-current={current('/explore') ? 'page' : undefined} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"><NavIcon name="explore" />Explore</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/saved" aria-current={current('/saved') ? 'page' : undefined} className="hidden min-h-11 items-center gap-2 text-sm text-stone-600 md:flex"><NavIcon name="saved" />Saved</Link>
          <Link href="/create" aria-current={current('/create') ? 'page' : undefined} className="hidden min-h-11 items-center gap-2 text-sm font-medium text-brand md:flex"><NavIcon name="create" />Create Journey</Link>
          <AccountMenu onUserChange={setAuthenticated} />
        </div>
      </div>
    </header>
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_#00000005] md:hidden">
      {mobileLinks.map(({ href, label, icon }) => <Link key={icon} href={href} aria-label={icon === "create" ? "Create Journey" : undefined} aria-current={current(href) ? 'page' : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${current(href) ? 'text-brand' : 'text-stone-500 hover:text-brand'}`}><span className={`flex h-8 w-10 items-center justify-center rounded-xl ${current(href) ? 'bg-[#e7eedf]' : ''}`}><NavIcon name={icon} /></span>{label}</Link>)}
    </nav>
  </>;
}
