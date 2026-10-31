import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { publicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = {
  ...publicMetadata('Privacy Policy', 'How Journey Buddy and Journey Creator handle account, journey, photo and location information.', '/privacy'),
  title: { absolute: 'Privacy Policy | Journey Buddy' },
};

const heading = 'text-xl font-semibold text-stone-900';

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy">
    <p>Journey Buddy is the travel service also shown as Journey Creator on our website and mobile app. This policy explains how information is handled when you discover, create, save or share journeys and use account and travel features.</p>

    <section aria-labelledby="privacy-account" className="space-y-3">
      <h2 id="privacy-account" className={heading}>Accounts and Google sign-in</h2>
      <p>Email and password registration and sign-in are handled through Supabase Auth. Account records include your email address, account identifier and authentication information. Registration may check whether an email already has an account; the checking service also uses keyed email hashes and request counters to limit abuse.</p>
      <p>If you choose Continue with Google, Google shares the identity information needed for sign-in, which can include your Google account identifier, email address, name and profile picture. This information is processed through Supabase Auth to authenticate you and associate the sign-in with your account. Google identity information may remain in the authentication record; choosing Google does not automatically publish your Google name or picture on your Journey profile.</p>
      <p>The Google sign-in flow requests basic identity and profile access. It does not request access to your Gmail inbox or Google contacts. Signing out of Journey ends the app session; your browser can remain signed in to Google.</p>
    </section>

    <section aria-labelledby="privacy-content" className="space-y-3">
      <h2 id="privacy-content" className={heading}>Profiles, journeys and photos</h2>
      <p>We process the profile information you provide, such as a username, display name, bio and avatar, together with journey titles, descriptions, stop locations, notes, photos, saved journeys and likes. This supports your account, private drafts, discovery and the journeys you choose to publish.</p>
      <p>Published journeys and their public creator information can be viewed by other people. Drafts and account-specific collections use account access controls. Other travelers can make their own copies or remixes of published journeys where that feature is offered; those copies can remain after you change or delete the source.</p>
      <p>Camera or photo-library permission is used when you choose photos for an avatar, journey or memory. Selected uploads are stored through Supabase Storage. Photos can contain sensitive details, including embedded metadata, so review what you upload. Publishing content can make the selected photos, notes and location details available to others.</p>
    </section>

    <section aria-labelledby="privacy-location" className="space-y-3">
      <h2 id="privacy-location" className={heading}>Maps and location</h2>
      <p>Mapbox provides maps, place search and road-route calculations. These features can send Mapbox map requests, search text and relevant coordinates, including your current position and next stop when you use location-based routing.</p>
      <p>On the website, active Travel Mode can use browser location permission to record a private travelled track, including GPS coordinates, times and accuracy. Signed-in track features can sync that private history to Supabase and keep a browser recovery buffer. Public journey pages and remixes do not include that private GPS history.</p>
      <p>On mobile, Travel Mode uses foreground location while active and does not upload a GPS route history. Unfinished-trip state can be saved locally for recovery. A separate, explicit action to use your current location for a memory or stop can save those coordinates as journey content; its visibility then follows the content you save or publish.</p>
      <p>You can decline or revoke location, camera and photo permissions in your browser or device settings. Features that depend on a permission may then be unavailable. Background tracking is not guaranteed.</p>
    </section>

    <section aria-labelledby="privacy-storage" className="space-y-3">
      <h2 id="privacy-storage" className={heading}>Sessions, local storage and service providers</h2>
      <p>The website uses authentication cookies and browser local or session storage for sign-in and feature recovery. The mobile app uses on-device storage for its session, a short-lived pending Google sign-in record, preferences and recovery data. Clearing browser or app storage can remove local data and sign you out.</p>
      <p>Supabase processes authentication, database and uploaded-media information. Google handles Google account authentication. Mapbox processes map, search and routing requests, and Vercel hosts the website. These providers receive information needed to operate their parts of the service and may process technical records such as IP addresses, device or browser information and request logs under their own service arrangements.</p>
      <p>If you email support, we use your email address and the information in your message to respond and investigate the request. Service and security records may also be needed to diagnose failures, prevent abuse or meet applicable obligations.</p>
    </section>

    <section aria-labelledby="privacy-controls" className="space-y-3">
      <h2 id="privacy-controls" className={heading}>Your choices, retention and deletion</h2>
      <p>You can edit available profile fields and use the app&apos;s controls to change or delete your own journeys and drafts. You can also revoke Journey&apos;s Google access through your Google Account settings. Revoking Google access does not itself delete your Journey account or saved content.</p>
      <p>For account deletion, access or correction requests that the app does not provide directly, contact the support address below. We may need to verify that you control the account before acting. Removing a journey is not the same as deleting every uploaded file or independent remix; copies already made by other people may remain.</p>
      <p>Information may be retained while needed to operate your account and requested features, handle support or security issues, or meet applicable obligations. Local recovery data can expire when the app next reads it. Deletion can be subject to backup and security retention; we do not promise an immediate purge of all copies.</p>
    </section>

    <section aria-labelledby="privacy-changes" className="space-y-3">
      <h2 id="privacy-changes" className={heading}>Changes to this policy</h2>
      <p>We will update this page when our data practices change and revise the date above. Material changes to how Google account information is used will be disclosed before that new use, with further consent requested when required.</p>
    </section>
  </LegalPage>;
}
