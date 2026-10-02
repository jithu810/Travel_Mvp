export type ProfileInput = { display_name:string; username:string; bio:string; avatar_path:string | null };
export function validateProfile(value:unknown): value is ProfileInput {
  if (!value || typeof value !== 'object') return false;
  const p=value as ProfileInput;
  return typeof p.display_name==='string' && p.display_name.trim().length<=80 && typeof p.username==='string' && /^[a-zA-Z0-9_]{3,30}$/.test(p.username) && p.username.toLowerCase()!=='edit' && typeof p.bio==='string' && p.bio.length<=500 && (p.avatar_path===null || (typeof p.avatar_path==='string' && p.avatar_path.length<=500));
}
