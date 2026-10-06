import { imageExtension, maxImageBytes } from './image-validation';

export const MAX_IMAGE_DIMENSION = 2048;
export const JPEG_QUALITY = 0.83;
export const SMALL_IMAGE_BYTES = 1024 * 1024;
export const MAX_DECODED_PIXELS = 50_000_000;
export const MAX_DECODED_DIMENSION = 12000;
export const IMAGE_PROCESS_TIMEOUT_MS = 15000;
export const journeyPhotoAccept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
const processingError = "This photo couldn't be processed. Please try another photo.";
const formatError = "This image format isn't supported on this browser. Choose a JPEG, PNG or WebP image.";
const dimensionsError = 'This photo is too large to process safely. Please choose a smaller photo.';
type Dimensions = { width: number; height: number };
type Decoded = Dimensions & { source: CanvasImageSource; release: () => void };

function checkDimensions({ width, height }: Dimensions) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error(processingError);
  if (width * height > MAX_DECODED_PIXELS || Math.max(width, height) > MAX_DECODED_DIMENSION) throw new Error(dimensionsError);
}
export function optimizedDimensions(width: number, height: number): Dimensions {
  checkDimensions({ width, height });
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Read only a bounded header, not another full copy of the original file.
function headerDimensions(bytes: Uint8Array, mime: string): Dimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png' && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (mime === 'image/webp' && bytes.length >= 30) {
    const chunk = String.fromCharCode(...bytes.slice(12,16));
    if (chunk === 'VP8X') return { width: 1 + bytes[24] + (bytes[25]<<8) + (bytes[26]<<16), height: 1 + bytes[27] + (bytes[28]<<8) + (bytes[29]<<16) };
    if (chunk === 'VP8 ') return { width: view.getUint16(26,true) & 0x3fff, height: view.getUint16(28,true) & 0x3fff };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) { const bits = view.getUint32(21,true); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
  }
  if (mime !== 'image/jpeg') return null;
  let point = 2, orientation = 1, dimensions: Dimensions | null = null;
  while (point + 4 <= bytes.length) {
    if (bytes[point] !== 0xff) break;
    const marker = bytes[point+1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(point+2);
    if (length < 2 || point + 2 + length > bytes.length) break;
    if (marker === 0xe1 && String.fromCharCode(...bytes.slice(point+4,point+10)) === 'Exif\0\0') {
      const tiff = point+10, end = point+2+length;
      if (tiff+8 <= end) {
        const little = bytes[tiff] === 0x49 && bytes[tiff+1] === 0x49;
        const big = bytes[tiff] === 0x4d && bytes[tiff+1] === 0x4d;
        if ((little || big) && view.getUint16(tiff+2,little) === 42) {
          const directory = tiff + view.getUint32(tiff+4,little);
          if (directory >= tiff && directory+2 <= end) {
            const count = Math.min(view.getUint16(directory,little),256);
            for (let index = 0; index < count; index++) {
              const entry = directory+2+index*12;
              if (entry+12 > end) break;
              if (view.getUint16(entry,little) === 0x112 && view.getUint16(entry+2,little) === 3 && view.getUint32(entry+4,little) === 1) orientation = view.getUint16(entry+8,little);
            }
          }
        }
      }
    }
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) dimensions = { width: view.getUint16(point+7), height: view.getUint16(point+5) };
    point += 2 + length;
  }
  return dimensions && orientation >= 5 && orientation <= 8 ? { width: dimensions.height, height: dimensions.width } : dimensions;
}

function imageFile(blob: Blob, original: File, mime: string) {
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
  const name = (original.name.split(/[\\/]/).at(-1) || 'photo').replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '').slice(0,100) || 'photo';
  return new File([blob], `${name}.${extension}`, { type: mime, lastModified: original.lastModified });
}

async function decode(file: Blob, dimensions: Dimensions | null, heif: boolean): Promise<Decoded> {
  if (!heif && typeof createImageBitmap === 'function') {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const target = dimensions ? optimizedDimensions(dimensions.width, dimensions.height) : null;
      const bitmap = await new Promise<ImageBitmap>((resolve,reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error(processingError)); }, IMAGE_PROCESS_TIMEOUT_MS);
        // Native orientation is baked into decoded pixels. Do not rotate again.
        createImageBitmap(file, { imageOrientation: 'from-image', ...(target ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' as const } : {}) }).then(value => {
          if (expired) value.close(); else resolve(value);
        }, reject);
      });
      if (target && (bitmap.width !== target.width || bitmap.height !== target.height)) { bitmap.close(); throw new Error(processingError); }
      try { checkDimensions(bitmap); } catch (error) { bitmap.close(); throw error; }
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch (error) {
      if (expired || error instanceof Error && error.message === dimensionsError) throw new Error(expired ? processingError : dimensionsError);
      // Safari/native decoder fallback, sequential rather than concurrent.
    }
    finally { clearTimeout(timer); }
  }
  const url = URL.createObjectURL(file), image = new Image();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const release = () => { clearTimeout(timer); image.onload = null; image.onerror = null; image.removeAttribute('src'); URL.revokeObjectURL(url); };
  try {
    await new Promise<void>((resolve,reject) => {
      timer = setTimeout(() => reject(new Error(heif ? formatError : processingError)), IMAGE_PROCESS_TIMEOUT_MS);
      image.onload = () => resolve(); image.onerror = () => reject(new Error(heif ? formatError : processingError)); image.src = url;
    });
    clearTimeout(timer); checkDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release };
  } catch (error) { release(); throw error; }
}

function encode(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error(processingError)), IMAGE_PROCESS_TIMEOUT_MS);
    try { canvas.toBlob(blob => { clearTimeout(timer); if (!blob?.size || blob.type !== mime) reject(new Error(processingError)); else resolve(blob); }, mime, mime === 'image/jpeg' ? JPEG_QUALITY : undefined); }
    catch { clearTimeout(timer); reject(new Error(processingError)); }
  });
}

/** One photo at a time; uses only native browser decoders and an output-sized canvas. */
export async function optimizeJourneyImage(file: File): Promise<File> {
  if (file.size > maxImageBytes) throw new Error('Image must be 15 MB or smaller.');
  if (!file.size) throw new Error(processingError);
  const header = new Uint8Array(await file.slice(0,65536).arrayBuffer());
  const mime = ['image/jpeg','image/png','image/webp'].find(type => imageExtension(header,type));
  const brand = String.fromCharCode(...header.slice(8,12));
  const heif = String.fromCharCode(...header.slice(4,8)) === 'ftyp' && ['heic','heix','hevc','hevx','heim','heis','mif1','msf1'].includes(brand) && (['image/heic','image/heif'].includes(file.type) || /\.hei[cf]$/i.test(file.name));
  if (!mime && !heif) throw new Error(formatError);
  if (mime && file.type && ![mime,'image/jpg'].includes(file.type)) throw new Error(processingError);
  const dimensions = mime ? headerDimensions(header,mime) : null;
  if (dimensions) checkDimensions(dimensions);
  const decoded = await decode(file,dimensions,heif);
  let released = false;
  const release = () => { if (!released) { decoded.release(); released = true; } };
  let canvas: HTMLCanvasElement | undefined;
  try {
    const originalSize = dimensions || decoded;
    const target = optimizedDimensions(decoded.width,decoded.height);
    const resizing = Math.max(originalSize.width,originalSize.height) > MAX_IMAGE_DIMENSION;
    if (!heif && !resizing && file.size <= SMALL_IMAGE_BYTES) return imageFile(file,file,mime!);
    canvas = document.createElement('canvas'); canvas.width = target.width; canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(processingError);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source,0,0,target.width,target.height);
    release();
    let outputMime = mime === 'image/png' ? 'image/png' : 'image/jpeg';
    if (mime === 'image/webp') {
      // Inspect only the bounded output canvas; preserve alpha instead of flattening it.
      const pixels = context.getImageData(0,0,target.width,target.height).data;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) { outputMime = 'image/png'; break; }
    }
    const result = await encode(canvas,outputMime);
    if (result.size > maxImageBytes) throw new Error('Image must be 15 MB or smaller.');
    if (!resizing && !heif && result.size >= file.size) return imageFile(file,file,mime!);
    const outputHeader = new Uint8Array(await result.slice(0,12).arrayBuffer());
    if (!imageExtension(outputHeader,outputMime)) throw new Error(processingError);
    return imageFile(result,file,outputMime);
  } catch (error) {
    if (error instanceof Error && [processingError,formatError,'Image must be 15 MB or smaller.'].includes(error.message)) throw error;
    throw new Error(processingError);
  } finally { release(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
}
