import { test, expect, type BrowserContext } from '@playwright/test';
import { mockGeolocation, emitLocation, gpsCounts, type GpsMock } from '../fixtures/geolocation';
import { mockNavigationMap } from '../fixtures/navigation-map';
import { mockDirections } from '../fixtures/directions';

const owner = '10000000-0000-0000-0000-000000000001', other = '10000000-0000-0000-0000-000000000002';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (id: string) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })}.test-signature`;
async function authenticate(context: BrowserContext, id: string) {
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'track@example.com', app_metadata: { provider: 'email' }, user_metadata: {} };
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode({ access_token: token(id), refresh_token: 'test-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })}`, domain: 'localhost', path: '/' }]);
}
const names = ['Nedumangad', 'Palode', 'Thenmala', 'Thenkasi', 'Sundarapandiapuram'];
const points = [[8.603315,77.00279],[8.723348,77.02781],[8.967814,77.07016],[8.955386,77.308655],[8.97222,77.39017]];

test('private GPS track survives pause, outage, lost response, refresh and completion without cross-user leakage', async ({ page, context, browser, request }, info) => {
  test.setTimeout(120000);
  const id = crypto.randomUUID(); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await authenticate(context, other); await mockGeolocation(page); await mockNavigationMap(page); await mockDirections(page);
  expect((await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey', { headers: { Authorization: `Bearer ${token(owner)}` }, data: { payload: { id, title: `Track journey ${info.project.name}`, destination_slug: 'thenkasi', traveler_type: 'couple', duration_days: 1, status: 'published', cover_image_path: null, stops: names.map((name,i) => ({ id: crypto.randomUUID(), name, sequence: i+1, latitude: points[i][0], longitude: points[i][1], day_number: 1, photo_path: null })) } } })).ok()).toBe(true);
  try {
    await page.goto(`/travel/${id}`);
    await page.getByRole('button', { name: 'Start Journey', exact: true }).click();
    await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-state','ready');
    await emitLocation(page,8.613,77.012);
    await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','1');
    await emitLocation(page,8.61301,77.012);
    await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','1');
    await emitLocation(page,8.6131,77.012);
    await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','2');
    await emitLocation(page,9.5,78);
    await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status','AVAILABLE');
    await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','2');
    await emitLocation(page,8.6132,77.012);
    await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','3');
    await expect(page.getByTestId('journey-map')).toHaveAttribute('data-track','recorded');
    expect((await gpsCounts(page)).watches).toBe(1);
    await page.getByRole('button',{name:'Pause Journey'}).click();
    await expect(page.getByTestId('travel-track')).toHaveAttribute('data-sync','saved');
    const trackId = await page.evaluate(j => JSON.parse(sessionStorage.getItem(`journeycreator:track:v1:${j.owner}:${j.id}`)!).track.id, { owner: other, id });
    const before = await (await context.request.get(`/api/journeys/${id}/track`)).json();
    expect(before.track.id).toBe(trackId); expect(before.track.points).toHaveLength(3); expect(before.track.status).toBe('PAUSED');
    await page.reload(); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','3'); expect((await gpsCounts(page)).active).toBe(0);
    await page.getByRole('button',{name:'Resume Journey'}).click(); await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await emitLocation(page,8.8,77.15); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','4'); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-segments','2');
    await emitLocation(page,8.8001,77.15); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','5');
    await page.evaluate(() => (window as unknown as {gpsMock: GpsMock}).gpsMock.fail(2)); await expect(page.getByTestId('gps-status')).toHaveAttribute('data-status','UNAVAILABLE');
    await emitLocation(page,8.8002,77.15); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-segments','3');
    // Server commits, response is lost: the exact batch must retry without duplicate points.
    let lost = false;
    await page.route(`**/api/journeys/${id}/track`, async route => {
      if (route.request().method()==='POST' && !lost) { lost=true; const response=await route.fetch(); expect(response.ok()).toBe(true); return route.fulfill({status:503,json:{error:'Simulated lost response'}}); }
      return route.continue();
    });
    await page.getByRole('button',{name:'Pause Journey'}).click(); await expect.poll(() => lost).toBe(true);
    await expect(page.getByTestId('travel-track')).toHaveAttribute('data-sync','pending');
    await page.getByRole('button',{name:'Retry private sync'}).click(); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-sync','saved');
    expect((await (await context.request.get(`/api/journeys/${id}/track`)).json()).track.points).toHaveLength(6);
    await page.unroute(`**/api/journeys/${id}/track`);
    await page.getByRole('button',{name:'Resume Journey'}).click(); await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await emitLocation(page,8.8003,77.15); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','7');
    // Refresh while private storage is unavailable: cached identity restores only the owner's local buffer.
    await page.route(`**/api/journeys/${id}/track`, route => route.fulfill({status:503,json:{error:'Simulated offline private storage'}}));
    await page.reload(); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','7'); await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await expect(page.getByTestId('travel-track')).toContainText('Simulated offline private storage');
    await page.unroute(`**/api/journeys/${id}/track`);
    await expect(page.getByTestId('current-location-marker')).toHaveCount(0);
    await emitLocation(page,8.8004,77.15); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','8'); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-segments','5');
    for (let i=0;i<4;i++) await page.getByRole('button',{name:'Mark Stop Complete',exact:true}).click();
    await page.getByRole('button',{name:'Pause Journey'}).click(); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-sync','saved');
    await page.getByRole('button',{name:'Resume Journey'}).click(); await expect.poll(async () => (await gpsCounts(page)).active).toBe(1);
    await emitLocation(page,...points[4] as [number,number]);
    await expect(page.getByTestId('travel-mode')).toHaveAttribute('data-state','COMPLETED'); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','9'); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-sync','saved');
    expect((await gpsCounts(page)).active).toBe(0);
    await page.reload(); await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','9'); await expect(page.getByTestId('track-statistics')).toContainText('completed');
    const final = await (await context.request.get(`/api/journeys/${id}/track`)).json(); expect(final.track.endedAt).not.toBeNull();
    const otherContext=await browser.newContext(); await authenticate(otherContext,owner);
    try {
      const privateReply=await (await otherContext.request.get(`http://localhost:3200/api/journeys/${id}/track?track=${trackId}`)).json(); expect(privateReply.track).toBeNull();
      const forbidden=await otherContext.request.post(`http://localhost:3200/api/journeys/${id}/track`,{headers:{Origin:'http://localhost:3200'},data:{ownerId:other}}); expect(forbidden.status()).toBe(403);
      const csrf=await context.request.post(`/api/journeys/${id}/track`,{headers:{Origin:'https://unrelated.example'},data:{}}); expect(csrf.status()).toBe(403);
      const oversized=await context.request.post(`/api/journeys/${id}/track`,{headers:{Origin:'http://localhost:3200'},data:{ownerId:other,huge:'x'.repeat(40000)}});expect(oversized.status()).toBe(413);
    } finally {await otherContext.close();}
    const publicDetail=await (await request.post('http://127.0.0.1:54329/rest/v1/rpc/get_journey_detail',{data:{target_id:id}})).json();expect(JSON.stringify(publicDetail)).not.toContain(trackId);
    await page.getByRole('button',{name:'Reset journey'}).click();await page.getByRole('button',{name:'Start Journey',exact:true}).click();await expect.poll(async ()=>(await gpsCounts(page)).active).toBe(1);
    await emitLocation(page,8.614,77.012);await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','1');
    await page.getByRole('button',{name:'End Journey',exact:true}).click();await page.getByRole('button',{name:'Confirm End'}).click();await expect(page.getByTestId('travel-track')).toHaveAttribute('data-sync','saved');
    const second=await(await context.request.get(`/api/journeys/${id}/track`)).json();expect(second.track.id).not.toBe(trackId);expect(second.track.status).toBe('CANCELLED');
    expect((await(await context.request.get(`/api/journeys/${id}/track?track=${trackId}`)).json()).track.status).toBe('COMPLETED');
    expect(errors).toEqual([]);
  } finally {await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`,{headers:{Authorization:`Bearer ${token(owner)}`}});}
});

test('anonymous track remains in memory and fits all requested mobile/desktop viewports', async ({ page, request }, info) => {
  test.setTimeout(120000); const id=crypto.randomUUID(),errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await mockGeolocation(page); await mockNavigationMap(page); await mockDirections(page);
  await request.post('http://127.0.0.1:54329/rest/v1/rpc/save_journey',{headers:{Authorization:`Bearer ${token(owner)}`},data:{payload:{id,title:'Anonymous actual travel',destination_slug:'thenkasi',traveler_type:'solo',duration_days:1,status:'published',cover_image_path:null,stops:names.map((name,i)=>({id:crypto.randomUUID(),name,sequence:i+1,latitude:points[i][0],longitude:points[i][1],photo_path:null,day_number:1}))}}});
  try {
    await page.goto(`/travel/${id}`); await page.getByRole('button',{name:'Start Journey',exact:true}).click();await expect.poll(async ()=>(await gpsCounts(page)).active).toBe(1);
    await emitLocation(page,8.613,77.012);await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','1');
    await emitLocation(page,8.6131,77.012);await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','2');await expect(page.getByTestId('journey-map')).toHaveAttribute('data-track','recorded');
    await expect(page.getByTestId('travel-track')).toContainText('not saved to an account');
    for (const [width,height] of [[360,800],[390,844],[412,915],[844,390],[1280,900],[1440,1000]]) {
      await page.setViewportSize({width,height});await page.getByTestId('journey-map').scrollIntoViewIfNeeded();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect((await page.getByTestId('route-marker').count())).toBe(5);
      await page.screenshot({path:info.outputPath(`track-${width}.png`),fullPage:true});
    }
    expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('journeycreator:track:')))).toEqual([]);
    await page.reload();await expect(page.getByTestId('travel-track')).toHaveAttribute('data-points','0');await expect(page.getByTestId('current-location-marker')).toHaveCount(0);
    expect((await(await request.get(`http://localhost:3200/api/journeys/${id}/track`)).json()).track).toBeNull();
    expect(errors).toEqual([]);
  } finally {await request.delete(`http://127.0.0.1:54329/rest/v1/journeys?id=eq.${id}`,{headers:{Authorization:`Bearer ${token(owner)}`}});}
});
