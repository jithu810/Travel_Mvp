import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedRequestOrigin } from '@/lib/request-origin';
import { createClient } from '@/lib/supabase/server';
import { uuidPattern } from '@/lib/journey/editor';
import { imageExtension, imageTypes, maxImageBytes } from '@/lib/journey/image-validation';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error: 'This request is not allowed.' }, { status: 403 });
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: 'Invalid journey.' }, { status: 400 });
  if (Number(request.headers.get('content-length')) > maxImageBytes + 65536) return NextResponse.json({ error: 'Image must be 15 MB or smaller.' }, { status: 413 });
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please log in before uploading.' }, { status: 401 });
    const { data: journey,error } = await client.from('journeys').select('user_id,status').eq('id',id).maybeSingle();
    if (error) throw error;
    if (!journey || journey.user_id !== user.id) return NextResponse.json({ error: 'Save your own journey before uploading images.' }, { status: 403 });
    const form = await request.formData();
    const file = form.get('file');
    const stop = form.get('stop');
    if (file instanceof File && file.size > maxImageBytes) return NextResponse.json({ error: 'Image must be 15 MB or smaller.' }, { status: 413 });
    if (!(file instanceof File) || !file.size || !imageTypes.includes(file.type)) return NextResponse.json({ error: 'Choose a JPEG, PNG or WebP image.' }, { status: 400 });
    if (stop !== null && (typeof stop !== 'string' || !uuidPattern.test(stop))) return NextResponse.json({ error: 'Invalid stop.' }, { status: 400 });
    if (typeof stop === 'string') {
      const { data: ownStop,error: stopError } = await client.from('journey_stops').select('id').eq('id',stop).eq('journey_id',id).maybeSingle();
      if (stopError) throw stopError;
      if (!ownStop) return NextResponse.json({ error: 'Save this stop in your draft before uploading its photo.' }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = imageExtension(bytes,file.type);
    if (!extension) return NextResponse.json({ error: 'The file contents do not match a supported image.' }, { status: 400 });
    const path = `${user.id}/${id}/${stop ? `stops/${stop}` : 'cover'}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from('journey-media').upload(path,bytes,{ contentType: file.type, upsert: false, cacheControl: '3600' });
    if (uploadError) return NextResponse.json({ error: 'Image upload failed. Check the Storage migration and try again. Your draft is safe.' }, { status: 503 });
    const { data } = await client.storage.from('journey-media').createSignedUrl(path,3600);
    return NextResponse.json({ path: `journey-media/${path}`, preview: data?.signedUrl || null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Image upload is unavailable. You can save without photos.' }, { status: 503 }); }
}
