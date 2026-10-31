import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { publicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = {
  ...publicMetadata('Terms of Service', 'Terms for using Journey Buddy and Journey Creator to discover, create and share travel journeys.', '/terms'),
  title: { absolute: 'Terms of Service | Journey Buddy' },
};

const heading = 'text-xl font-semibold text-stone-900';

export default function TermsPage() {
  return <LegalPage title="Terms of Service">
    <p>These terms apply to Journey Buddy, the travel service also shown as Journey Creator on our website and mobile app. By using the service, you agree to these terms. If you do not agree, stop using the service. Our <Link href="/privacy" className="font-medium text-brand underline underline-offset-4">Privacy Policy</Link> explains how information is handled.</p>

    <section aria-labelledby="terms-account" className="space-y-3">
      <h2 id="terms-account" className={heading}>Your account</h2>
      <p>Use account information that you are entitled to provide, keep your sign-in details secure and contact us if you believe someone has accessed your account without permission. Do not impersonate another person or use an account you are not authorized to access. Some features require sign-in.</p>
      <p>Email/password and Google sign-in can provide access to the same account where the authentication service links the identities. Choose the correct account before continuing, especially on a shared device. You are responsible for the content and actions you submit through your account.</p>
    </section>

    <section aria-labelledby="terms-content" className="space-y-3">
      <h2 id="terms-content" className={heading}>Your content and publishing choices</h2>
      <p>You retain ownership of the photos, writing and other content you contribute. Only upload information you have the right to use and share, including permission for photos or personal information about other people.</p>
      <p>Submitting content allows the service and its providers to store, process and display it as needed for the features you request. Choosing to publish makes the journey and its public creator information available to other people. Use private drafts when you are not ready to share, and check the visibility of notes, photos and locations before publishing.</p>
      <p>Where a published journey offers copying or remixing, publishing allows other travelers to use the available journey information in their own copies through that feature. Those copies are independent: later edits or deletion of your source journey may not change or remove them. A remix does not transfer ownership of the original author&apos;s content or grant permission to reuse material beyond the rights you hold and the feature offered.</p>
    </section>

    <section aria-labelledby="terms-conduct" className="space-y-3">
      <h2 id="terms-conduct" className={heading}>Acceptable use</h2>
      <p>Use the service lawfully and respect other travelers and communities. Do not upload unlawful, abusive, deceptive or infringing content, expose private information without permission, send spam, attempt to access another user&apos;s private data or interfere with the service or its security controls.</p>
      <p>Contact support to report harmful content, a rights concern or suspected misuse. Access or content may be restricted where reasonably necessary to address abuse, security issues or applicable requirements.</p>
    </section>

    <section aria-labelledby="terms-travel" className="space-y-3">
      <h2 id="terms-travel" className={heading}>Travel information and safety</h2>
      <p>Journeys are contributed by travelers, and map, search and route information comes from external services. Information can be incomplete, inaccurate or out of date. Confirm opening times, access permissions, road conditions, local rules and suitability before relying on a journey.</p>
      <p>Location accuracy, connectivity, browser or device behavior and battery limits can affect navigation and recording. Background operation and an uninterrupted GPS history are not guaranteed. Pay attention to your surroundings, avoid interacting with the app while driving, and use appropriate local help or emergency services when needed.</p>
    </section>

    <section aria-labelledby="terms-service" className="space-y-3">
      <h2 id="terms-service" className={heading}>Availability and third-party services</h2>
      <p>Features may change, be interrupted or become unavailable during maintenance or provider failures. Keep your own copies of important content. Website and mobile features may differ.</p>
      <p>The service uses providers including Supabase, Google, Mapbox and Vercel. Your use of their sign-in, mapping or other directly provided features may also be subject to their terms. No statement here guarantees their availability or the accuracy of their information.</p>
    </section>

    <section aria-labelledby="terms-leaving" className="space-y-3">
      <h2 id="terms-leaving" className={heading}>Stopping use and requesting deletion</h2>
      <p>You may stop using the service and sign out at any time. Use available controls to edit or delete your content, or contact support to request account deletion. We may ask you to verify account ownership. Deletion and retention are described in the Privacy Policy, including limitations involving backups and independently copied content.</p>
      <p>These terms do not remove rights or protections that apply to you under law.</p>
    </section>

    <section aria-labelledby="terms-changes" className="space-y-3">
      <h2 id="terms-changes" className={heading}>Updates to these terms</h2>
      <p>We may update these terms as the service changes. The current version and its update date will be available on this page. Review material updates before continuing to use the affected features, and contact support if you have questions.</p>
    </section>
  </LegalPage>;
}
