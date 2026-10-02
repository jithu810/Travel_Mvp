"use client";
import { useEffect, useRef } from 'react';
import { AuthForm } from '@/components/auth/auth-form';
export function LoginDialog({ onClose, onLogin }: { onClose: () => void; onLogin: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="login-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-6 text-foreground backdrop:bg-black/40">
    <div className="flex items-start justify-between gap-3"><h2 id="login-title" className="text-2xl font-semibold">Log in to continue</h2><button type="button" onClick={onClose} aria-label="Close login" className="h-11 w-11 rounded-full bg-stone-100">×</button></div>
    <p className="mt-3 text-sm leading-6 text-stone-600">Like, save, or make a private copy with your Journey account.</p>
    <AuthForm next={typeof window === 'undefined' ? '/profile' : window.location.pathname} onLogin={onLogin}/>
  </dialog>;
}
