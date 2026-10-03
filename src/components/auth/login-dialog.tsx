"use client";
import { useEffect, useRef } from 'react';
import { AuthForm } from '@/components/auth/auth-form';
export function LoginDialog({ onClose, onLogin, intent }: { onClose: () => void; onLogin: () => void; intent?: 'like' | 'save' | 'copy' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const modal = dialog.current;
    modal?.showModal();
    return () => { modal?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="login-title" aria-describedby="login-description" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl bg-white p-6 text-foreground backdrop:bg-black/40">
    <div className="flex items-start justify-between gap-3"><h2 id="login-title" className="text-2xl font-semibold">Log in to continue</h2><button type="button" onClick={onClose} aria-label="Close login" className="h-11 w-11 rounded-full bg-stone-100">×</button></div>
    <p id="login-description" className="mt-3 text-sm leading-6 text-stone-600">{intent === 'save' ? 'Sign in to save this journey and keep it for later.' : intent === 'like' ? 'Sign in to like this journey and show the creator your appreciation.' : intent === 'copy' ? 'Sign in to remix this journey into your own private, editable version.' : 'Like, save, or make a private copy with your Journey account.'}</p>
    <AuthForm next={typeof window === 'undefined' ? '/profile' : window.location.pathname} onLogin={onLogin}/>
    <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-full border border-stone-200 px-4 text-sm font-medium text-brand">Continue Exploring</button>
  </dialog>;
}
