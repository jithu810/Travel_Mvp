import { NextResponse,type NextRequest } from 'next/server';
import { isAllowedRequestOrigin } from '@/lib/request-origin';
import { createClient } from '@/lib/supabase/server';
import { imageExtension,imageTypes,maxImageBytes } from '@/lib/journey/image-validation';
export async function POST(request:NextRequest) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error:'Invalid request origin.' },{ status:403 });
  if (Number(request.headers.get('content-length'))>maxImageBytes+65536) return NextResponse.json({ error:'Image must be 15 MB or smaller.' },{ status:413 });
  try {
    const client=await createClient();
    const { data:{ user } }=await client.auth.getUser();
    if (!user) return NextResponse.json({ error:'Please log in.' },{ status:401 });
    const file=(await request.formData()).get('file');
    if (file instanceof File && file.size>maxImageBytes) return NextResponse.json({ error:'Image must be 15 MB or smaller.' },{ status:413 });
    if (!(file instanceof File) || !file.size || !imageTypes.includes(file.type)) return NextResponse.json({ error:'Choose a JPEG, PNG or WebP image.' },{ status:400 });
    const bytes=new Uint8Array(await file.arrayBuffer());
    const extension=imageExtension(bytes,file.type);
    if (!extension) return NextResponse.json({ error:'The file contents do not match a supported image.' },{ status:400 });
    const path=`${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error }=await client.storage.from('profile-avatars').upload(path,bytes,{ contentType:file.type,upsert:false });
    if (error) return NextResponse.json({ error:'Avatar upload failed. Check the profile Storage migration.' },{ status:503 });
    const { data }=await client.storage.from('profile-avatars').createSignedUrl(path,3600);
    return NextResponse.json({ path:`profile-avatars/${path}`,preview:data?.signedUrl || null });
  } catch { return NextResponse.json({ error:'Avatar upload is unavailable. Please try again.' },{ status:503 }); }
}
