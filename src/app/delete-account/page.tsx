import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { publicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = {
  ...publicMetadata('Request account deletion', 'How to request deletion of your Journey Buddy / Journey Creator account and associated data.', '/delete-account'),
  title: { absolute: 'Request account deletion | Journey Buddy' },
};

const supportEmail = 'sreejith1043@gmail.com';
const subject = 'Journey account deletion request';
const body = 'I would like to delete my Journey Buddy / Journey Creator account and associated data.\n\nAccount email: \nUsername (if known): \n\nPlease verify my ownership and confirm when the request has been completed.';
const requestUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const heading = 'text-xl font-semibold text-stone-900';

export default function DeleteAccountPage() {
  return <LegalPage title="Request account deletion" updated={{ dateTime: '2026-11-07', label: '7 November 2026' }}>
    <p>You can request deletion of your Journey Buddy / Journey Creator account and its associated data here, including if you have uninstalled the app. You do not need to sign in to this website.</p>

    <section aria-labelledby="deletion-request" className="space-y-3">
      <h2 id="deletion-request" className={heading}>Send your request</h2>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Email <a href={`mailto:${supportEmail}`} className="break-all font-medium text-brand underline underline-offset-4">{supportEmail}</a> from the email address linked to your Journey account, if you can access it.</li>
        <li>Use the subject <strong>{subject}</strong>. Include your account email and username, if known, and say that you want your account and associated data deleted.</li>
        <li>Support will need to verify account ownership before deletion. If you cannot access your account email, explain that in your message so support can discuss verification.</li>
      </ol>
      <p>Never send your password, sign-in codes or identity documents in the initial email.</p>
      <a href={requestUrl} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-3 font-semibold text-white">Prepare deletion request</a>
      <p className="text-sm">This opens an email draft. Review and send it yourself. Opening or closing the draft does not submit a request or delete your account. If no email app opens, copy the address and subject above into your email service.</p>
    </section>

    <section aria-labelledby="deletion-data" className="space-y-3">
      <h2 id="deletion-data" className={heading}>Account and data covered</h2>
      <p>A full account-deletion request covers your sign-in account, profile, own private and published journeys and stops, uploaded journey photos and avatar, saved journeys, likes, connections and private travel records held by the service.</p>
      <p>This is a support request, not immediate automated deletion. Support should confirm the outcome and explain any information that must be retained for a legitimate security or legal reason. Backups and service-security records may be retained under the practices described in our Privacy Policy; this page does not promise immediate removal from every backup.</p>
      <p>Other people may have made independent copies or remixes of content you published. Those copies are not the same as your account and may remain. Include a link in your request if you have a concern about copied content or personal information.</p>
    </section>

    <section aria-labelledby="deletion-device" className="space-y-3">
      <h2 id="deletion-device" className={heading}>Your device and Google account</h2>
      <p>Signing out, uninstalling Journey or revoking its Google access does not by itself delete your Journey account. Deleting Journey does not delete your Google account.</p>
      <p>Local preferences, recovery copies and previously cached content can remain on a device. After preserving anything you want to keep, clear Journey&apos;s app or website storage on your own devices to remove local copies.</p>
      <p>See the <Link href="/privacy" className="font-medium text-brand underline underline-offset-4">Privacy Policy</Link> for more about information handling and retention.</p>
    </section>
  </LegalPage>;
}
