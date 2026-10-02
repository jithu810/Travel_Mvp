import type { Metadata } from 'next';
import { getSiteUrl, siteUrl } from './site';

export const siteDescription = 'Discover travel journeys, explore destinations and follow ordered routes. Save journeys you love and remix them into your own trips.';
export const privateRobots = { index: false, follow: false, noarchive: true };

export function privateMetadata(title = 'Private journey'): Metadata {
  return { title, description: 'This page is private.', robots: privateRobots, openGraph: null, twitter: null };
}

export function seoImage(cover?: string | null): string | undefined {
  const fallback = siteUrl('/images/goa.jpg');
  if (!cover) return fallback;
  if (cover.startsWith('/images/')) return siteUrl(cover);
  try {
    const url = new URL(cover);
    // Uploaded covers stay private in Storage; expiring URLs are never OG images.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /\/storage\/|\/object\/(?:sign|authenticated)\//i.test(url.pathname)) return fallback;
    return url.href;
  } catch { return fallback; }
}

export function publicMetadata(title: string, description: string, path: string, cover?: string | null, index = true): Metadata {
  const canonical = siteUrl(path);
  const image = seoImage(cover);
  const fullTitle = `${title} | Journey`;
  return {
    title, description,
    ...(canonical ? { alternates: { canonical } } : {}),
    robots: { index: !!getSiteUrl() && index, follow: true },
    openGraph: { type: 'website', title: fullTitle, description, siteName: 'Journey', ...(canonical ? { url: canonical } : {}), ...(image ? { images: [{ url: image, alt: title }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: fullTitle, description, ...(image ? { images: [image] } : {}) },
  };
}

export function plainDescription(value: string, fallback: string): string {
  const text = value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, 200);
}
