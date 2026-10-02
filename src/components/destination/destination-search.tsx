"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { searchDestinations } from "@/lib/discovery/destinations";

export function DestinationSearch() {
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = searchDestinations(query);
  function select(slug: string) { setOpen(false); router.push(`/destination/${slug}`); }

  return <form role="search" className="relative z-20 w-full max-w-xl" onSubmit={(event) => {
    event.preventDefault();
    if (matches.length) select(matches[Math.min(active, matches.length - 1)].slug);
    else setOpen(true);
  }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="sr-only">Search destinations</label>
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2 pl-4 shadow-lg shadow-black/5 sm:p-3 sm:pl-5">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5 shrink-0 text-stone-500"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.8"/><path d="m15 15 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
      <input id={id} type="search" role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open}
        aria-controls={`${id}-suggestions`} aria-activedescendant={open && matches.length ? `${id}-option-${Math.min(active, matches.length - 1)}` : undefined}
        value={query} placeholder="Where do you want to go?" className="min-w-0 flex-1 bg-transparent py-3 text-base text-foreground outline-none placeholder:text-stone-400"
        onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive((current) => matches.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0);
          }
        }} />
      <button type="submit" className="flex min-h-12 shrink-0 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-emerald-900 sm:px-6">Search</button>
    </div>
    {open && <div className="absolute top-full right-0 left-0 mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white p-2 text-foreground shadow-xl">
      <ul id={`${id}-suggestions`} role="listbox" aria-label="Destination suggestions">
        {matches.map((destination, index) => <li key={destination.slug} id={`${id}-option-${index}`} role="option" aria-selected={index === active}>
          <button type="button" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => select(destination.slug)}
            className={`flex min-h-14 w-full items-center justify-between rounded-xl px-4 text-left ${index === active ? "bg-stone-100" : "hover:bg-stone-50"}`}>
            <span><span className="block font-semibold">{destination.name}</span><span className="text-xs text-stone-500">{destination.region}</span></span><span aria-hidden="true">↗</span>
          </button>
        </li>)}
      </ul>
      {!matches.length && <p role="status" className="p-4 text-sm text-stone-500">No destinations found. Try Goa, Varkala, Munnar, Kochi, or Thenkasi.</p>}
    </div>}
  </form>;
}
