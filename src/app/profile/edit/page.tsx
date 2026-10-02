import { requireUser } from '@/lib/auth/session';
import { resolveMedia } from '@/lib/journey/media';
import { safeImage } from '@/lib/journey/detail';
import { ProfileForm } from '@/components/auth/profile-form';
import { PageHeading } from '@/components/ui/page-heading';
export const metadata = { title: 'Edit Profile', robots: { index: false, follow: false, noarchive: true } };
export default async function EditProfilePage() {
  const { user,client }=await requireUser('/profile/edit');
  const { data,error }=await client.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if (error || !data) throw new Error('Your profile could not be loaded. Check the database setup.');
  const media=await resolveMedia(client,[data.avatar_path]);
  return <><PageHeading eyebrow="Your space" title="Edit Profile" description="Tell travelers a little about yourself."/><ProfileForm initial={{ display_name:data.display_name || (typeof user.user_metadata.display_name==='string' ? user.user_metadata.display_name : ''),username:data.username || '',bio:data.bio || '',avatar_path:data.avatar_path }} avatar={safeImage(media.get(data.avatar_path || '') || data.avatar_path)}/></>;
}
