"use client";

import { useState } from 'react';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "@/components/auth/account-menu";



export function Header() {
  const pathname = usePathname();
  const [authenticated,setAuthenticated]=useState(false);
  const links=[{ href:"/explore",label:"Explore" },...(authenticated ? [{ href:"/create",label:"Create Journey" },{ href:"/saved",label:"Saved" }] : [])];
  return (
    <header className="border-b border-stone-200 bg-white/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link href="/" aria-label="Journey home" className="flex min-h-11 items-center gap-2 text-2xl font-bold tracking-tight">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="h-8 w-8">
            <path d="M5 25 15 5l12 20H5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="m10 15 5 4 5-7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          Journey
        </Link>
        <AccountMenu onUserChange={setAuthenticated}/>
        <nav aria-label="Main navigation" className="flex w-full gap-1 sm:order-none sm:w-auto sm:gap-4">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-full px-3 text-sm font-medium ${pathname === href ? "bg-brand text-white" : "text-stone-600 hover:bg-stone-100"}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
