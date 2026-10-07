"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoginDialog } from "@/components/auth/login-dialog";

import { useJourneyActionState } from "./use-journey-action-state";
import { shareJourneyUrl } from '@/lib/seo/site';

type Props = { id: string; title: string; isPublic: boolean; viewerId: string | null; initialLikes: number; initialLiked: boolean; initialSaved: boolean };

export function JourneyActions({ id, title, isPublic, initialLikes }: Props) {
  const router = useRouter();
  const { state, setState, loading, error: stateError, refresh } = useJourneyActionState(id);
  const user = state?.user?.id || null;
  const liked = state?.liked === true;
  const saved = !!user && state?.saved === true;
  const likes = state?.likes ?? initialLikes;
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [intent, setIntent] = useState<'like' | 'save' | 'copy'>('save');
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function act(action: "like" | "save" | "copy") {
    setIntent(action);
    if (!user) { setLogin(true); return; }
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`/api/journeys/${id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "like" ? { enabled: !liked } : action === "save" ? { enabled: !saved } : {}) }) });
      const data = await response.json();
      if (response.status === 401) { setState(null); setLogin(true); return; }
      if (!response.ok) throw new Error(data.error || "Could not complete this action.");
      if (action === "copy") { router.push(`/create?draft=${data.copiedId}&copied=1`); return; }
      setState(previous => previous?.user?.id === user ? { ...data, user: previous.user } : previous);
      setMessage(action === "like" ? (data.liked ? "Journey liked" : "Like removed") : (data.saved ? "Journey saved" : "Removed from saved journeys"));
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }

  async function share() {
    const url = shareJourneyUrl(id, window.location.origin);
    setMessage(""); setFailed(false);
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ url }))) {
        try { await navigator.share({ title, url }); setMessage("Journey shared"); return; }
        catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
      }
      await navigator.clipboard.writeText(url); setMessage("Link copied");
    } catch { setFailed(true); setMessage(`Sharing is unavailable. Copy this public URL: ${url}`); }
  }

  return <div className="space-y-5">
    {isPublic && <section aria-label="Journey controls" className="space-y-3">
      <h2 className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">Ready to travel?</h2>
      <p className="max-w-xl text-sm leading-6 text-stone-600">Follow the creator’s stops with GPS and navigate between them.</p>
      <div className="flex flex-col items-start gap-1">
        <a href={`/travel/${encodeURIComponent(id)}`} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white sm:w-auto">Start Journey →</a>
        <a href={`/travel/${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-brand underline underline-offset-4">Preview Travel Mode</a>
      </div>
      <p className="max-w-xl text-xs leading-5 text-stone-500">Start in Travel Mode to allow location. Manual completion works without GPS; progress stays in this browser tab.</p>
    </section>}
    <div role="group" aria-label="Social actions" className="flex flex-wrap gap-2 border-t border-stone-200 pt-4">
      <button disabled={busy || loading || !!stateError || !isPublic} onClick={() => act("like")} aria-pressed={liked} aria-label={liked ? "Unlike journey" : "Like journey"} className="min-h-11 rounded-full border border-stone-200 bg-white px-4 text-sm font-medium disabled:opacity-60">{liked ? "♥" : "♡"} {likes} <span className="sr-only">likes</span></button>
      <button disabled={busy || loading || !!stateError || !isPublic} onClick={() => act("save")} aria-pressed={saved} title="Keep this journey for later" className="min-h-11 rounded-full border border-stone-200 bg-white px-4 text-sm font-medium disabled:opacity-60">{saved ? "Saved ✓" : "Save"}</button>
      <button disabled={!isPublic} onClick={share} title={isPublic ? "Share public journey" : "Private journeys cannot be shared publicly"} className="min-h-11 rounded-full border border-stone-200 bg-white px-4 text-sm font-medium disabled:opacity-40">Share ↗</button>
    </div>
    <section aria-label="Journey options" className="space-y-3 border-t border-stone-200 pt-4">
      <h2 className="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Journey options</h2>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-6">
        {isPublic && <div>
          <a href="#journey-route" title="Explore the creator’s ordered stops as your route" className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">Use This Journey</a>
          <p className="text-xs leading-5 text-stone-500">View the creator’s ordered route.</p>
        </div>}
        <div>
          <button disabled={busy || loading || !!stateError || !isPublic} onClick={() => act("copy")} className="min-h-11 text-left text-sm font-medium text-brand underline underline-offset-4 disabled:opacity-60">{busy ? "Working…" : "Remix This Journey"}</button>
          <p className="text-xs leading-5 text-stone-500">Make your own editable version.</p>
        </div>
      </div>
    </section>
    {stateError && <p role="alert" className="text-sm text-red-700">{stateError}</p>}
    {message && <p role={failed ? "alert" : "status"} className={`break-words text-sm ${failed ? "text-red-700" : "text-brand"}`}>{message}</p>}
    {login && <LoginDialog intent={intent} onClose={() => setLogin(false)} onLogin={() => { setLogin(false); refresh(); router.refresh(); }}/>}
  </div>;
}
