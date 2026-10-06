import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { installImageOptimizer } from './fixtures/browser-image-optimizer';
import { optimizedDimensions } from '../src/lib/journey/optimize-image';

test.beforeEach(async ({ page }) => { await page.goto('about:blank'); await installImageOptimizer(page); });

test('small JPEG/PNG/WebP stay byte-identical, are not enlarged, and get safe consistent filenames', async ({ page }) => {
  expect(optimizedDimensions(4032,3024)).toEqual({ width:2048,height:1536 });
  expect(optimizedDimensions(3024,4032)).toEqual({ width:1536,height:2048 });
  for (const format of ['jpeg','png','webp'] as const) {
    const bytes = await sharp({ create: { width:1200,height:800,channels:3,background:'#245b46' } }).toFormat(format).toBuffer();
    const result = await page.evaluate(async ({ bytes,mime }) => {
      const input = new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'C:\\private\\IMG_4821.wrong',{ type:mime });
      const output = await window.optimizeTestImage(input);
      const bitmap = await createImageBitmap(output);
      const result = { size:output.size,type:output.type,name:output.name,width:bitmap.width,height:bitmap.height,bytes:[...new Uint8Array(await output.arrayBuffer())] }; bitmap.close(); return result;
    }, { bytes:bytes.toString('base64'),mime:`image/${format}` });
    expect(result.bytes).toEqual([...bytes]); expect([result.width,result.height]).toEqual([1200,800]);
    expect(result.type).toBe(`image/${format}`); expect(result.name).toBe(`IMG_4821.${format === 'jpeg' ? 'jpg' : format}`);
  }
});

test('a high-detail smartphone JPEG is resized, compressed substantially and stays landscape', async ({ page }) => {
  const width=4032,height=3024,pixels=Buffer.alloc(width*height*3); let seed=17;
  for(let i=0;i<pixels.length;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; pixels[i]=seed>>>24; }
  const bytes=await sharp(pixels,{ raw:{ width,height,channels:3 } }).jpeg({ quality:98 }).toBuffer();
  expect(bytes.length).toBeLessThan(15*1024*1024); expect(bytes.length).toBeGreaterThan(5*1024*1024);
  const result=await page.evaluate(async bytes=>{
    const output=await window.optimizeTestImage(new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'landscape.jpeg',{ type:'image/jpeg' }));
    const bitmap=await createImageBitmap(output), result={size:output.size,type:output.type,name:output.name,width:bitmap.width,height:bitmap.height}; bitmap.close(); return result;
  },bytes.toString('base64'));
  expect([result.width,result.height]).toEqual([2048,1536]); expect(result.type).toBe('image/jpeg'); expect(result.name).toBe('landscape.jpg');
  expect(result.size).toBeLessThan(bytes.length*.5); expect(result.size).toBeLessThan(3*1024*1024);
});

test('portrait PNG and WebP preserve aspect ratio and transparent pixels', async ({ page }) => {
  for(const format of ['png','webp'] as const) {
    const bytes=await sharp({create:{width:3024,height:4032,channels:4,background:{r:20,g:80,b:40,alpha:.4}}}).toFormat(format).toBuffer();
    const result=await page.evaluate(async ({bytes,mime})=>{
      const output=await window.optimizeTestImage(new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'portrait.webp',{type:mime}));
      const bitmap=await createImageBitmap(output), canvas=document.createElement('canvas'); canvas.width=bitmap.width;canvas.height=bitmap.height;
      const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);const alpha=context.getImageData(1,1,1,1).data[3];
      const result={width:bitmap.width,height:bitmap.height,type:output.type,name:output.name,alpha};bitmap.close();canvas.width=canvas.height=0;return result;
    },{bytes:bytes.toString('base64'),mime:`image/${format}`});
    expect([result.width,result.height]).toEqual([1536,2048]);expect(result.type).toBe('image/png');expect(result.name).toBe('portrait.png');expect(result.alpha).toBeLessThan(200);expect(result.alpha).toBeGreaterThan(50);
  }
});

test('EXIF orientations 1–8 survive conversion as correctly rotated/mirrored pixels in both native decode paths',async({page})=>{
  const width=600,height=400,pixels=Buffer.alloc(width*height*3);
  const colors=[[240,20,20],[20,240,20],[20,20,240],[240,240,20]];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const color=colors[(y>=height/2?2:0)+(x>=width/2?1:0)],offset=(y*width+x)*3;pixels.set(color,offset);}
  for(const fallback of [false,true])for(let orientation=1;orientation<=8;orientation++){
    const jpeg=await sharp(pixels,{raw:{width,height,channels:3}}).withMetadata({orientation}).jpeg({quality:95}).toBuffer();
    const expected=await sharp(jpeg).autoOrient().raw().toBuffer({resolveWithObject:true});
    const expectedColors=[[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([x,y])=>[...expected.data.subarray((Math.floor(expected.info.height*y)*expected.info.width+Math.floor(expected.info.width*x))*3,(Math.floor(expected.info.height*y)*expected.info.width+Math.floor(expected.info.width*x))*3+3)]);
    const padded=Buffer.concat([jpeg,Buffer.alloc(1024*1024)]);
    const result=await page.evaluate(async({bytes,fallback})=>{
      const original=window.createImageBitmap;if(fallback)Object.defineProperty(window,'createImageBitmap',{value:undefined,configurable:true,writable:true});
      let output:File;try{output=await window.optimizeTestImage(new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'oriented.jpg',{type:'image/jpeg'}));}finally{Object.defineProperty(window,'createImageBitmap',{value:original,configurable:true,writable:true});}
      const url=URL.createObjectURL(output),image=new Image();try{
        await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=reject;image.src=url;});
        const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
        const colors=[[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([x,y])=>[...context.getImageData(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1).data].slice(0,3));
        const result={width:canvas.width,height:canvas.height,colors,type:output.type};canvas.width=canvas.height=0;return result;
      }finally{image.removeAttribute('src');URL.revokeObjectURL(url);}
    },{bytes:padded.toString('base64'),fallback});
    expect([result.width,result.height]).toEqual([expected.info.width,expected.info.height]);expect(result.type).toBe('image/jpeg');
    result.colors.forEach((color,i)=>color.forEach((value,c)=>expect(Math.abs(value-expectedColors[i][c])).toBeLessThan(25)));
  }
});

test('bad/unsupported/HEIF files and oversized bytes/dimensions fail clearly before upload',async({page})=>{
  const result=await page.evaluate(async()=>{
    const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer);view.setUint32(16,20000);view.setUint32(20,20000);
    const heif=new Uint8Array(24);heif.set([0,0,0,24,...[...'ftypheic'].map(c=>c.charCodeAt(0))]);
    const samples=[new File([new Uint8Array([255,216,255,224,0,16])],'bad.jpg',{type:'image/jpeg'}),new File(['GIF89a'],'animation.gif',{type:'image/gif'}),new File([heif],'bad.HEIC',{type:'image/heic'}),new File([new Uint8Array(15*1024*1024+1)],'huge.jpg',{type:'image/jpeg'}),new File([png],'pixels.png',{type:'image/png'})];
    const messages=[];for(const file of samples)try{await window.optimizeTestImage(file);messages.push('unexpected success');}catch(error){messages.push((error as Error).message);}return messages;
  });
  expect(result[0]).toContain("couldn't be processed");expect(result[1]).toContain("format isn't supported");expect(result[2]).toContain("format isn't supported");expect(result[3]).toBe('Image must be 15 MB or smaller.');expect(result[4]).toContain('too large to process safely');
});

test('fallback object URLs and output canvases are released on success and encoding failure',async({page})=>{
  const jpeg=await sharp({create:{width:2600,height:1700,channels:3,background:'#245b46'}}).jpeg().toBuffer();
  const result=await page.evaluate(async bytes=>{
    const bitmap=window.createImageBitmap,create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),element=document.createElement.bind(document),blob=HTMLCanvasElement.prototype.toBlob;
    let created=0,revoked=0;const canvases:HTMLCanvasElement[]=[];
    Object.defineProperty(window,'createImageBitmap',{value:undefined,configurable:true,writable:true});URL.createObjectURL=(value)=>{created++;return create(value);};URL.revokeObjectURL=(value)=>{revoked++;revoke(value);};
    document.createElement=((...args:Parameters<typeof element>)=>{const node=element(...args);if(node instanceof HTMLCanvasElement)canvases.push(node);return node;}) as typeof document.createElement;
    const file=new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'large.jpg',{type:'image/jpeg'});let error='';
    try{await window.optimizeTestImage(file);HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};try{await window.optimizeTestImage(file);}catch(e){error=(e as Error).message;}}
    finally{Object.defineProperty(window,'createImageBitmap',{value:bitmap,configurable:true,writable:true});URL.createObjectURL=create;URL.revokeObjectURL=revoke;document.createElement=element;HTMLCanvasElement.prototype.toBlob=blob;}
    return{created,revoked,canvases:canvases.map(c=>[c.width,c.height]),error};
  },jpeg.toString('base64'));
  expect(result.created).toBe(2);expect(result.revoked).toBe(2);expect(result.canvases).toEqual([[0,0],[0,0]]);expect(result.error).toContain("couldn't be processed");
});
