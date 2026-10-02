export const maxImageBytes = 15 * 1024 * 1024;
export const imageTypes = ['image/jpeg','image/png','image/webp'];
export function imageExtension(bytes: Uint8Array, mime: string) {
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (mime === 'image/png' && [137,80,78,71,13,10,26,10].every((byte,index) => bytes[index] === byte)) return 'png';
  if (mime === 'image/webp' && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'webp';
  return null;
}
