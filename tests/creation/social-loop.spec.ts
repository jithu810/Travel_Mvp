import { selectEditorDestination } from '../fixtures/editor-destination';
import { expect,test,type BrowserContext,type Page } from '@playwright/test';

const owner='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';

const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');

async function authenticate(context:BrowserContext,id:string) {

  const user={ id,aud:'authenticated',role:'authenticated',email:id===owner ? 'creator@example.com' : 'traveler@example.com',app_metadata:{ provider:'email' },user_metadata:{ display_name:id===owner ? 'Test Creator' : 'Test Traveler' } };

  const access_token=`${encode({ alg:'HS256',typ:'JWT' })}.${encode({ sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600 })}.test-signature`;

  await context.addCookies([{ name:'sb-127-auth-token',value:`base64-${encode({ access_token,refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user })}`,domain:'localhost',path:'/' }]);

}

async function search(page:Page,name:string) {

  await page.getByRole('combobox',{ name:'Search for a place' }).fill(name);

  await page.getByRole('option',{ name:`${name}, Goa, India` }).getByTestId('add-place').click();

}

async function mockPlaces(page:Page) {

  await page.route('**/search/geocode/v6/forward?**',route=>{

    const name=new URL(route.request().url()).searchParams.get('q')!;

    const names=['Candolim Beach','Fontainhas','Fort Aguada','Old Goa'];

    const index=names.indexOf(name);

    return route.fulfill({ json:{ features:[{ id:`place-${name}`,geometry:{ coordinates:[73.8+index/100,15.4+index/100] },properties:{ name,full_address:`${name}, Goa, India`,mapbox_id:`place-${name}` } }] } });

  });

}

const photo={ name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=','base64') };

test('two-user social loop, published owner edits, profiles, private saved state and independent deletion',async({ page,context,browser },testInfo)=>{

  test.setTimeout(120000);

  await authenticate(context,owner); await mockPlaces(page);

  const title=`Original Goa ${testInfo.project.name}`;

  await page.goto('/create');

  await page.getByLabel('Journey title').fill(title);

  await selectEditorDestination(page, 'goa');

  await page.getByRole('button', { name: /Friends/ }).click();

  await page.getByLabel('Duration in days').fill('3');

  for(const name of ['Candolim Beach','Fontainhas','Fort Aguada']) await search(page,name);

  await page.getByTestId('editor-stop').first().getByText('Details & photo',{ exact:true }).click();

  await page.getByTestId('editor-stop').first().getByLabel('Stop description').fill('Source sunset notes');

  await page.getByTestId('editor-stop').first().getByRole('combobox',{ name:'Day',exact:true }).selectOption('1');

  await page.getByTestId('editor-stop').first().getByLabel('Rating (optional)').fill('4.5');

  await page.getByLabel('Cover image (optional)').setInputFiles(photo);

  await expect(page.getByRole('status').filter({ hasText:'Photo uploaded and draft saved.' })).toBeVisible();

  const original=new URL(page.url()).searchParams.get('draft')!;

  await page.getByRole('button',{ name:'Publish Journey',exact:true }).click();

  await page.getByRole('link',{ name:'View Journey',exact:true }).click();

  await expect(page.getByRole('link',{ name:'Edit Journey',exact:true })).toBeVisible();

  await page.getByRole('link',{ name:'Edit Journey',exact:true }).click();

  await expect(page.getByLabel('Journey title')).toHaveValue(title);

  await page.getByLabel('Description',{ exact:true }).fill('Owner updated the published description.');

  await page.getByLabel('Cover image (optional)').setInputFiles(photo);

  await expect(page.getByRole('status').filter({ hasText:'Photo uploaded and draft saved.' })).toBeVisible();

  await page.getByRole('button',{ name:'Save Changes',exact:true }).click();

  await page.getByRole('link',{ name:'View Journey',exact:true }).click();

  await expect(page.getByText('Owner updated the published description.')).toBeVisible();

  const bContext=await browser.newContext({ viewport:page.viewportSize()! });

  await authenticate(bContext,other);

  const b=await bContext.newPage(); await mockPlaces(b);

  const anonymousContext=await browser.newContext({ viewport:page.viewportSize()! });

  const visitor=await anonymousContext.newPage();

  await b.goto('http://localhost:3200/explore');

  await expect(b.getByRole('link',{ name:'Create Journey',exact:true })).toBeVisible();

  await expect(b.getByRole('link',{ name:'Saved',exact:true })).toBeVisible();

  await b.getByRole('link',{ name:`Open journey: ${title}` }).click();

  await expect(b.getByRole('link',{ name:'Edit Journey',exact:true })).toHaveCount(0);

  await b.goto(`http://localhost:3200/create?edit=${original}`);

  await expect(b.getByRole('heading',{ name:'This path ends here.' })).toBeVisible();

  const forbiddenDelete=await b.request.delete(`http://localhost:3200/api/journeys/${original}`,{ headers:{ Origin:'http://localhost:3200' } });

  expect(forbiddenDelete.status()).toBe(404);

  await b.goto(`http://localhost:3200/journey/${original}`);

  for(const name of ['Like journey','Unlike journey','Like journey']) await b.getByRole('button',{ name,exact:true }).click();

  await expect(b.getByRole('button',{ name:'Unlike journey' })).toContainText('1');

  const repeatedLike=await b.request.post(`http://localhost:3200/api/journeys/${original}/actions`,{ headers:{ Origin:'http://localhost:3200' },data:{ action:'like',enabled:true } });

  expect((await repeatedLike.json()).likes).toBe(1);

  await b.getByRole('button',{ name:'Save',exact:true }).click();

  await expect(b.getByRole('button',{ name:'Saved ✓',exact:true })).toBeVisible();

  await b.reload();
  await expect(b.getByRole('button',{ name:'Saved ✓',exact:true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{ name:'Save',exact:true })).toBeEnabled();
  await b.goto('http://localhost:3200/profile/creator_a');
  await expect(b.getByRole('button',{ name:`Remove saved ${title}`,exact:true })).toBeVisible();
  await page.goto('http://localhost:3200/profile/creator_a');
  await expect(page.getByRole('button',{ name:`Save ${title}`,exact:true })).toBeEnabled();
  await visitor.goto('http://localhost:3200/profile/creator_a');
  await expect(visitor.getByRole('button',{ name:`Save ${title}`,exact:true })).toBeEnabled();
  await visitor.getByRole('button',{ name:`Save ${title}`,exact:true }).click();
  await expect(visitor.getByRole('dialog',{ name:'Log in to continue' })).toBeVisible();
  await visitor.getByRole('button',{ name:'Close login' }).click();
  await page.goto(`http://localhost:3200/journey/${original}`);
  await b.goto('http://localhost:3200/saved');

  await expect(b.getByRole('link',{ name:`Open journey: ${title}` })).toBeVisible();

  await b.getByRole('button',{ name:`Remove saved ${title}`,exact:true }).click();

  await expect(b.getByRole('link',{ name:`Open journey: ${title}` })).toHaveCount(0);

  await b.goto(`http://localhost:3200/journey/${original}`);

  await b.getByRole('button',{ name:'Save',exact:true }).click();

  await expect(b.getByRole('button',{ name:'Saved ✓',exact:true })).toBeVisible();

  await b.getByRole('button',{ name:'Remix This Journey',exact:true }).click();

  await expect(b).toHaveURL(/\/create\?draft=/);

  const copied=new URL(b.url()).searchParams.get('draft')!;

  expect(copied).not.toBe(original);

  await expect(b.getByLabel('Journey title')).toHaveValue(title);

  await expect(b.getByTestId('editor-stop').getByRole('heading')).toHaveText(['1. Candolim Beach','2. Fontainhas','3. Fort Aguada']);

  await b.getByTestId('editor-stop').first().getByText('Details & photo',{ exact:true }).click();

  await expect(b.getByTestId('editor-stop').first().getByLabel('Stop description')).toHaveValue('Source sunset notes');

  await expect(b.getByTestId('editor-stop').first().getByLabel('Rating (optional)')).toHaveValue('4.5');

  const remix=`Remix Goa ${testInfo.project.name}`;

  await b.getByLabel('Journey title').fill(remix);

  await b.getByRole('button',{ name:'Remove Fontainhas',exact:true }).click();

  await search(b,'Old Goa');

  await b.getByRole('button',{ name:'Move Old Goa up',exact:true }).click();

  await b.getByRole('button',{ name:'Save Draft',exact:true }).click();

  await expect(b.getByRole('status').filter({ hasText:'Draft saved.' })).toBeVisible();

  await visitor.goto(`http://localhost:3200/journey/${copied}`);

  await expect(visitor.getByRole('heading',{ name:'This path ends here.' })).toBeVisible();

  await b.goto('http://localhost:3200/profile');

  const profileUrl=b.url();

  await b.getByRole('link',{ name:'Drafts',exact:true }).click();

  await expect(b.getByRole('link',{ name:`Open journey: ${remix}` })).toBeVisible();

  await visitor.goto(`${profileUrl}?tab=drafts`);

  await expect(visitor.getByRole('link',{ name:'Drafts',exact:true })).toHaveCount(0);

  await expect(visitor.getByRole('link',{ name:`Open journey: ${remix}` })).toHaveCount(0);

  await b.getByRole('link',{ name:`Open journey: ${remix}` }).click();

  await b.getByRole('button',{ name:'Publish Journey',exact:true }).click();

  await b.getByRole('link',{ name:'View Journey',exact:true }).click();

  await expect(b.getByRole('link',{ name:title,exact:true })).toHaveAttribute('href',`/journey/${original}`);

  await b.getByRole('link',{ name:title,exact:true }).click();

  await expect(b.getByRole('heading',{ level:1 })).toHaveText(title);

  await page.reload();

  await expect(page.getByRole('heading',{ level:1 })).toHaveText(title);

  await expect(page.getByTestId('journey-stop')).toHaveCount(3);

  await page.goto(`http://localhost:3200/create?edit=${copied}`);

  await expect(page.getByRole('heading',{ name:'This path ends here.' })).toBeVisible();

  await b.goto('http://localhost:3200/profile/edit');

  await b.getByLabel('Username',{ exact:true }).fill('creator_a');

  await b.getByRole('button',{ name:'Save Profile',exact:true }).click();

  await expect(b.getByRole('alert').filter({ hasText:'That username is already taken.' })).toBeVisible();

  const username=`traveler_${testInfo.project.name}`;

  await b.getByLabel('Username',{ exact:true }).fill(username);

  await b.getByLabel('Display name',{ exact:true }).fill('Traveler B');

  await b.getByLabel('Bio',{ exact:true }).fill('Exploring the coast.');

  await b.getByLabel('Avatar',{ exact:true }).setInputFiles(photo);

  await expect(b.getByRole('status').filter({ hasText:'Avatar uploaded.' })).toBeVisible();

  await b.getByRole('button',{ name:'Save Profile',exact:true }).click();

  await expect(b).toHaveURL(`http://localhost:3200/profile/${username}?updated=1`);

  await expect(b.getByRole('link',{ name:`Open journey: ${remix}` })).toBeVisible();

  await visitor.goto(`http://localhost:3200/profile/${username}`);

  await expect(visitor.getByRole('heading',{ level:1 })).toHaveText('Traveler B');

  await expect(visitor.getByText('Exploring the coast.')).toBeVisible();

  await expect(visitor.getByRole('link',{ name:`Open journey: ${remix}` })).toBeVisible();

  await visitor.screenshot({ path:testInfo.outputPath('profile.png'),fullPage:true });

  await expect(visitor.getByText('traveler@example.com')).toHaveCount(0);

  await visitor.goto(`http://localhost:3200/journey/${copied}`);

  await expect(visitor.getByRole('heading',{ level:1 })).toHaveText(remix);

  for(const name of ['Like journey','Save','Remix This Journey']) {

    await visitor.getByRole('button',{ name,exact:true }).click();

    await expect(visitor.getByRole('dialog',{ name:'Log in to continue' })).toBeVisible();

    await visitor.getByRole('button',{ name:'Close login' }).click();

  }

  await visitor.goto('http://localhost:3200/saved');

  await expect(visitor).toHaveURL(/\/login\?next=/);

  await page.goto(`http://localhost:3200/journey/${original}`);

  await page.getByRole('button',{ name:'Delete Journey',exact:true }).click();

  await page.getByRole('button',{ name:'Cancel',exact:true }).click();

  await expect(page.getByRole('heading',{ level:1 })).toHaveText(title);

  await page.getByRole('button',{ name:'Delete Journey',exact:true }).click();

  await page.getByRole('button',{ name:'Confirm Delete',exact:true }).click();

  await expect(page.getByRole('status').filter({ hasText:'Journey deleted.' })).toBeVisible();

  await b.goto(`http://localhost:3200/journey/${copied}`);

  await expect(b.getByRole('heading',{ level:1 })).toHaveText(remix);

  await expect(b.getByTestId('journey-stop')).toHaveCount(3);

  await b.goto('http://localhost:3200/saved');

  await expect(b.getByRole('link',{ name:`Open journey: ${title}` })).toHaveCount(0);

  await b.goto(`http://localhost:3200/journey/${copied}`);

  await expect(b.getByRole('heading',{ level:1 })).toHaveText(remix);

  await expect(b.getByTestId('journey-stop')).toHaveCount(3);

  expect(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

  await b.screenshot({ path:testInfo.outputPath('remix.png'),fullPage:true });

  await b.getByRole('button',{ name:'Delete Journey',exact:true }).click();

  await b.getByRole('button',{ name:'Confirm Delete',exact:true }).click();

  await expect(b.getByRole('status').filter({ hasText:'Journey deleted.' })).toBeVisible();

  await bContext.close(); await anonymousContext.close();

});
