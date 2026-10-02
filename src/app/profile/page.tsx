import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
export const metadata = { title: 'Your account', robots: { index: false, follow: false, noarchive: true } };
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ user?: string; deleted?: string }> }) {
  const { user,client } = await requireUser('/profile');
  const { user: requested,deleted } = await searchParams;
  const { data: profile,error } = await client.from('profiles').select('username').eq('id',requested || user.id).maybeSingle();
  if (error) throw new Error('Profile could not be loaded. Check the social-loop migration.');
  if (!profile?.username) redirect('/profile/edit');
  redirect(`/profile/${encodeURIComponent(profile.username)}${deleted ? "?deleted=1" : ""}`);
}
