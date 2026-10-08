// Direct-edge awareness only; never invent a root or fetch a private ancestor.
export type LineageContent = { id: string; copiedFrom: string | null; contentKey: string };
export function hasKnownSimilarParent(candidate: LineageContent, known: readonly LineageContent[]) {
  return !!candidate.copiedFrom && !!candidate.contentKey && known.some(source => source.id === candidate.copiedFrom && source.contentKey === candidate.contentKey);
}
