// HTTP fixture for browser interactions. Actual ownership, transactions and RLS
// are checked against real migration SQL in the database test scripts.
import http from 'node:http';
const owner='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
const fresh='10000000-0000-0000-0000-000000000003';
const users=new Map([owner,other,fresh].map((id,index)=>[id,{ id,aud:'authenticated',role:'authenticated',email:index===2 ? 'new@example.com' : index ? 'traveler@example.com' : 'creator@example.com',app_metadata:{ provider:'email',providers:['email'] },user_metadata:{ display_name:index===2 ? 'A traveler with a considerably longer display name' : index ? 'Test Traveler' : 'Test Creator' },created_at:new Date().toISOString() }]));
const profiles=new Map([owner,other,fresh].map((id,index)=>[id,{ id,username:index===2 ? 'new_creator' : index ? 'traveler_b' : 'creator_a',display_name:index===2 ? 'New Traveler' : index ? 'Test Traveler' : 'Test Creator',bio:'',avatar_path:null }]));
const journeys=new Map(),tracks=new Map(),objects=new Map(),likes=new Set(),saves=new Set();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=','base64');
const server=http.createServer(async(request,response)=>{
  response.setHeader('Access-Control-Allow-Origin','http://localhost:3200');
  response.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,x-supabase-api-version');
  response.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  if (request.method==='OPTIONS') { response.writeHead(204); return response.end(); }
  const url=new URL(request.url,'http://127.0.0.1:54329');
  const chunks=[]; for await(const chunk of request) chunks.push(chunk);
  const bytes=Buffer.concat(chunks);
  let body={}; try { body=bytes.length ? JSON.parse(bytes.toString()) : {}; } catch { /* Binary upload. */ }
  let uid=null;
  try { const token=request.headers.authorization?.replace(/^Bearer /,''); if (token?.endsWith('.test-signature')) uid=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub; } catch { /* Anonymous. */ }
  if (!users.has(uid)) uid=null;
  const authenticated=!!uid;
  const filter=key=>url.searchParams.get(key)?.replace(/^eq\./,'');
  const relation=(id,user=uid)=>`${user}:${id}`;
  const visible=j=>j && (j.status==='published' || j.user_id===uid);
  function json(value,status=200) { response.writeHead(status,{ 'Content-Type':'application/json' }); response.end(JSON.stringify(value)); }
  function card(j) { const p=profiles.get(j.user_id); return { ...j,creator_id:j.user_id,creator_name:p.display_name || p.username,creator_username:p.username,creator_avatar:p.avatar_path,likes_count:[...likes].filter(key=>key.endsWith(`:${j.id}`)).length,saved:saves.has(relation(j.id)),liked:likes.has(relation(j.id)),stops:j.stops.map(s=>({ ...s,position:s.sequence })) }; }
  if (url.pathname==='/health') return json({ ok:true });
  if (url.pathname==='/auth/v1/user') return authenticated ? json(users.get(uid)) : json({ message:'Unauthorized' },401);
  if (url.pathname==='/auth/v1/logout') { response.writeHead(204); return response.end(); }
  if (url.pathname==='/auth/v1/.well-known/jwks.json') return json({ keys:[] });
  if (url.pathname==='/rest/v1/travel_tracks') {
    if (!uid) return json({code:'42501',message:'Private'},403);
    const rows=[...tracks.values()].filter(t=>t.user_id===uid && (!filter('journey_id') || t.journey_id===filter('journey_id')) && (!filter('id') || t.id===filter('id'))).sort((a,b)=>b.started_at.localeCompare(a.started_at)).slice(0,1);
    return json(rows);
  }
  if (url.pathname==='/rest/v1/rpc/append_travel_track') {
    const p=body.payload;
    if (!uid || !visible(journeys.get(p.journeyId))) return json({code:'42501',message:'Private'},403);
    let t=tracks.get(p.id);
    if (t && t.user_id!==uid) return json({code:'42501',message:'Private'},403);
    if (!t) { t={id:p.id,journey_id:p.journeyId,user_id:uid,started_at:new Date(p.startedAt).toISOString(),ended_at:null,status:'ACTIVE',points:[],revision:0,last_payload:null}; tracks.set(p.id,t); }
    if (t.revision===p.revision+1 && JSON.stringify(t.last_payload)===JSON.stringify(p)) return json({revision:t.revision,count:t.points.length});
    if (t.revision!==p.revision) return json({code:'40001',message:'Conflict'},409);
    if (['COMPLETED','CANCELLED'].includes(t.status)) return json({code:'22023',message:'Finished'},400);
    t.points.push(...p.points);t.status=p.status;t.ended_at=p.endedAt===null?null:new Date(p.endedAt).toISOString();t.revision++;t.last_payload=p;
    return json({revision:t.revision,count:t.points.length});
  }
  if (url.pathname==='/rest/v1/profiles') {
    const p=profiles.get(filter('id'));
    if (!p || p.id!==uid) return json([]);
    if (request.method==='PATCH') {
      if ([...profiles.values()].some(other=>other.id!==uid && other.username.toLowerCase()===body.username?.toLowerCase())) return json({ code:'23505',message:'Duplicate username' },409);
      Object.assign(p,body);
    }
    return json([p]);
  }
  if (url.pathname==='/rest/v1/rpc/get_public_profile') {
    const p=[...profiles.values()].find(p=>p.username.toLowerCase()===body.handle?.toLowerCase());
    return json(p ? { ...p,published_count:[...journeys.values()].filter(j=>j.user_id===p.id && j.status==='published').length } : null);
  }
  if (url.pathname==='/rest/v1/rpc/get_account_journeys') {
    return json([...journeys.values()].filter(j=>body.collection==='saved' ? uid && j.status==='published' && saves.has(relation(j.id)) : j.user_id===body.owner_id && (body.collection==='drafts' ? uid===body.owner_id && j.status==='draft' : j.status==='published')).map(card));
  }
  if (url.pathname==='/rest/v1/rpc/save_journey') {
    if (!authenticated) return json({ code:'42501',message:'Unauthorized' },403);
    const input=body.payload,current=journeys.get(input.id);
    if (current && current.user_id!==uid) return json({ code:'42501',message:'Owner only' },403);
    if (current && current.updated_at!==input.updated_at) return json({ code:'40001',message:'Conflict' },409);
    const destination={ goa:['Goa',15.49,73.83],varkala:['Varkala',8.74,76.72],munnar:['Munnar',10.09,77.06],kochi:['Kochi',9.97,76.28],thenkasi:['Thenkasi',8.96,77.31] }[input.destination_slug];
    const saved={ ...current,...input,destination_name:destination?.[0],destination_latitude:destination?.[1],destination_longitude:destination?.[2],user_id:uid,published_at:input.status==='published' ? current?.published_at || new Date().toISOString() : null,updated_at:new Date().toISOString(),is_demo:false };
    journeys.set(input.id,saved); return json({ id:saved.id,status:saved.status,updated_at:saved.updated_at });
  }
  if (url.pathname==='/rest/v1/rpc/copy_journey') {
    const source=journeys.get(body.source_id);
    if (!uid || source?.status!=='published') return json({ code:'42501',message:'Published only' },403);
    const id=crypto.randomUUID();
    journeys.set(id,{ ...source,id,user_id:uid,status:'draft',published_at:null,updated_at:new Date().toISOString(),copied_from_journey_id:source.id,is_demo:false,stops:source.stops.map(s=>({ ...s,id:crypto.randomUUID() })) });
    return json(id);
  }
  if (url.pathname==='/rest/v1/journeys') {
    let rows=[...journeys.values()].filter(j=>(!filter('id') || (filter('id').startsWith('in.(') ? filter('id').slice(4,-1).split(',').includes(j.id) : filter('id')===j.id)) && (!filter('user_id') || filter('user_id')===j.user_id) && (!filter('status') || filter('status')===j.status) && (!filter('is_demo') || String(j.is_demo)===filter('is_demo')) && (!filter('traveler_type') || j.traveler_type===filter('traveler_type')) && visible(j));
    if (request.method==='DELETE') {
      const owned=rows.filter(j=>j.user_id===uid);
      for(const j of owned) { journeys.delete(j.id); for(const [key,t] of tracks) if(t.journey_id===j.id) tracks.delete(key); for(const set of [likes,saves]) for(const key of set) if (key.endsWith(`:${j.id}`)) set.delete(key); for(const copy of journeys.values()) if (copy.copied_from_journey_id===j.id) copy.copied_from_journey_id=null; }
      return json(owned.map(j=>({ id:j.id })));
    }
    const orders=(url.searchParams.get('order') || '').split(',');
    if (orders.length) rows.sort((a,b)=> { for (const order of orders) { const [key,direction]=order.split('.');const x=a[key] || '',y=b[key] || '';if(x!==y) return (x<y ? -1 : 1)*(direction==='desc' ? -1 : 1); } return 0; });
    const offset=Number(url.searchParams.get('offset') || 0),limit=Number(url.searchParams.get('limit') || rows.length);
    rows=rows.slice(offset,offset+limit);
    return json(rows.map(j=>({ ...j,stops:undefined,...(url.searchParams.get('select')?.includes('journey_stops(') ? { journey_stops:j.stops } : {}) })));
  }
  if (url.pathname==='/rest/v1/journey_stops') {
    const j=journeys.get(filter('journey_id'));
    return json(visible(j) ? j.stops.filter(s=>!filter('id') || s.id===filter('id')).map(s=>({ ...s,journey_id:j.id })) : []);
  }
  if (['/rest/v1/journey_likes','/rest/v1/saved_journeys'].includes(url.pathname)) {
    const set=url.pathname.includes('journey_likes') ? likes : saves;
    if (!uid) return json({ code:'42501',message:'Authentication required' },403);
    if (request.method==='DELETE') { if (filter('user_id')===uid) set.delete(relation(filter('journey_id'))); return json([]); }
    if (request.method==='POST') { if (body.user_id!==uid || journeys.get(body.journey_id)?.status!=='published') return json({ code:'42501',message:'Published only' },403); set.add(relation(body.journey_id)); return json([]); }
    return json([...set].filter(key=>key.startsWith(`${uid}:`)).map(key=>({ user_id:uid,journey_id:key.slice(uid.length+1) })));
  }
  if (url.pathname==='/rest/v1/rpc/get_public_journeys') return json([...journeys.values()].filter(j=>j.status==='published' && (!body.journey_filter || body.journey_filter===j.id) && (!body.destination_filter || j.destination_slug===body.destination_filter) && (!body.traveler_filter || j.traveler_type===body.traveler_filter)).sort((a,b)=>(b.published_at || '').localeCompare(a.published_at || '') || a.id.localeCompare(b.id)).slice(0,100).map(card));
  if (url.pathname==='/rest/v1/rpc/get_journey_detail') { const j=journeys.get(body.target_id); return json(visible(j) ? card(j) : null); }
  if (url.pathname.startsWith('/storage/v1/object/sign/')) {
    if (request.method==='GET') { response.writeHead(200,{ 'Content-Type':'image/png' }); return response.end(png); }
    const rest=url.pathname.slice('/storage/v1/object/sign/'.length),slash=rest.indexOf('/'),bucket=slash<0 ? rest : rest.slice(0,slash);
    const signed=path=>`/object/sign/${bucket}/${path}?token=mock`;
    if (Array.isArray(body.paths)) return json(body.paths.map(path=>({ path,signedURL:signed(path),error:null })));
    return json({ signedURL:signed(rest.slice(slash+1)) });
  }
  if (url.pathname.startsWith('/storage/v1/object/') && request.method==='POST') {
    if (!uid) return json({ message:'Unauthorized' },403);
    const key=url.pathname.slice('/storage/v1/object/'.length);
    objects.set(key,bytes); return json({ Key:key,Id:crypto.randomUUID() });
  }
  return json({ message:'Unimplemented fixture endpoint',code:'PGRST202' },404);
});
server.listen(54329,'127.0.0.1',()=>console.log('Creation/social Supabase fixture ready'));
