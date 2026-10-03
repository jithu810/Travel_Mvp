'use client';
import { useEffect, useRef, type ReactNode } from 'react';

export function TravelDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const modal = ref.current;
    modal?.showModal();
    return () => { modal?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} onCancel={onClose} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length);
    const first = elements[0], last = elements.at(-1);
    if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  }} aria-labelledby="travel-dialog-title" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl bg-white p-6 text-foreground backdrop:bg-black/40"><div className="flex items-start justify-between gap-3"><h2 id="travel-dialog-title" className="min-w-0 break-words text-2xl font-semibold">{title}</h2><button type="button" aria-label="Close details" onClick={onClose} className="h-11 w-11 shrink-0 rounded-full bg-stone-100">×</button></div>{children}</dialog>;
}
