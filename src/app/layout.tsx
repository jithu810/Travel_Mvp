import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/ui/header";
import "./globals.css";
import { getSiteUrl } from '@/lib/seo/site';
import { siteDescription } from '@/lib/seo/metadata';

export const metadata: Metadata = {
  title: { default: "Discover & Share Travel Journeys | Journey", template: "%s | Journey" },
  description: siteDescription,
  ...(getSiteUrl() ? { metadataBase: new URL(getSiteUrl()!) } : {}),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">
          Skip to content
        </a>
        <Header />
        <main id="main" className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">{children}</main>
        <footer className="mx-auto max-w-6xl px-5 py-8 text-sm text-stone-500 sm:px-8">
          Journey · Places are only part of the story.
          <details className="mt-3 text-xs leading-6"><summary className="cursor-pointer">Photo credits</summary><p>Representative cover photography from Unsplash. Munnar photo: <a href="https://unsplash.com/photos/zoxqwWXy-EE" className="underline">Unsplash</a>. Kochi: <a href="https://commons.wikimedia.org/wiki/File:Chinese_Fishing_Nets_Cochin.jpg" className="underline">Chinese Fishing Nets Cochin — Brian Snelson</a>, <a href="https://creativecommons.org/licenses/by/2.0/" className="underline">CC BY 2.0</a>; cropped for display. Demo imagery is not user-uploaded photography.</p></details>
        </footer>
      </body>
    </html>
  );
}
