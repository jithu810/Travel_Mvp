import { NextResponse,type NextRequest } from 'next/server';
import { isAllowedRequestOrigin } from '@/lib/request-origin';
import { createClient } from '@/lib/supabase/server';
import { validateProfile } from '@/lib/profile/validation';
export async function PATCH(request:NextRequest) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error:'Invalid request origin.' },{ status:403 });
  try {
    const client=await createClient();
    const { data:{ user } }=await client.auth.getUser();
    if (!user) return NextResponse.json({ error:'Please log in.' },{ status:401 });
    let input:unknown;
    try { input=await request.json(); } catch { return NextResponse.json({ error:'Invalid profile data.' },{ status:400 }); }
    if (!validateProfile(input)) return NextResponse.json({ error:'Use a username of 3–30 letters, numbers or underscores. Name: up to 80 characters; bio: up to 500.' },{ status:400 });
    if (input.avatar_path) {
      const { data:current }=await client.from('profiles').select('avatar_path').eq('id',user.id).maybeSingle();
      if (input.avatar_path!==current?.avatar_path) {
        if (!input.avatar_path.startsWith(`profile-avatars/${user.id}/`)) return NextResponse.json({ error:'Choose your own uploaded avatar.' },{ status:400 });
        const { data,error }=await client.storage.from('profile-avatars').createSignedUrl(input.avatar_path.slice(16),60);
        if (error || !data?.signedUrl) return NextResponse.json({ error:'Upload the avatar before saving.' },{ status:400 });
      }
    }
    const { data,error }=await client.from('profiles').update({ display_name:input.display_name.trim(),username:input.username.toLowerCase(),bio:input.bio.trim(),avatar_path:input.avatar_path }).eq('id',user.id).select('username').maybeSingle();
    if (error) return NextResponse.json({ error:error.code==='23505' ? 'That username is already taken.' : 'Profile could not be saved. Please try again.' },{ status:error.code==='23505' ? 409 : 503 });
    if (!data) return NextResponse.json({ error:'Profile is missing. Check the database migration.' },{ status:503 });
    return NextResponse.json({ username:data.username },{ headers:{ 'Cache-Control':'private, no-store' } });
  } catch { return NextResponse.json({ error:'Profile could not be saved. Please try again.' },{ status:503 }); }
}
