import { NextResponse,type NextRequest } from 'next/server';
import { isAllowedRequestOrigin } from '@/lib/request-origin';
import { createClient } from '@/lib/supabase/server';
import { uuidPattern } from '@/lib/journey/editor';
export async function DELETE(request: NextRequest,{ params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error:'Invalid request origin.' },{ status:403 });
  try {
    const client=await createClient();
    const { data:{ user } }=await client.auth.getUser();
    if (!user) return NextResponse.json({ error:'Please log in.' },{ status:401 });
    const { id }=await params;
    if (!uuidPattern.test(id)) return NextResponse.json({ error:'Invalid journey.' },{ status:400 });
    const { data,error }=await client.from('journeys').delete().eq('id',id).eq('user_id',user.id).select('id');
    if (error) return NextResponse.json({ error:'Journey could not be deleted. Please try again.' },{ status:503 });
    if (!data?.length) return NextResponse.json({ error:'Journey not found or not owned by you.' },{ status:404 });
    // Immutable images remain because independently owned copies may reference them.
    return NextResponse.json({ deleted:true },{ headers:{ 'Cache-Control':'private, no-store' } });
  } catch { return NextResponse.json({ error:'Deletion is unavailable. Please try again.' },{ status:503 }); }
}
