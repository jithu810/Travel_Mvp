/** Direct parent = immediate copied-from journey. A root is confirmed only when
 * every public hop resolves and the final journey has no parent. Descendants
 * include indirect remixes; the Story preview intentionally lists direct ones. */
export type LineageNode = { id: string; title: string; copiedFrom: string | null };
export const lineageDepthLimit = 8;
export function isJourneyId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
export async function resolvePublicRoot(start: LineageNode, lookup: (id: string) => Promise<LineageNode | null>, maxDepth = lineageDepthLimit) {
  const visited = new Set<string>();
  let node = start;
  const limit = Math.max(0, Math.min(lineageDepthLimit, maxDepth));
  for (let depth = 0; depth <= limit; depth++) {
    if (!isJourneyId(node.id)) return { root: null, reason: 'invalid' as const };
    const key = node.id.toLowerCase();
    if (visited.has(key)) return { root: null, reason: 'cycle' as const };
    visited.add(key);
    if (node.copiedFrom === null) return { root: node, reason: 'complete' as const };
    if (!isJourneyId(node.copiedFrom)) return { root: null, reason: 'invalid' as const };
    if (visited.has(node.copiedFrom.toLowerCase())) return { root: null, reason: 'cycle' as const };
    if (depth === limit) return { root: null, reason: 'depth-limit' as const };
    const parent = await lookup(node.copiedFrom).catch(() => null);
    if (!parent || !isJourneyId(parent.id) || parent.id.toLowerCase() !== node.copiedFrom.toLowerCase()) return { root: null, reason: 'unavailable' as const };
    node = parent;
  }
  return { root: null, reason: 'depth-limit' as const };
}
