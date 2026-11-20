export type ReviewDraft = { evidence: string; changed: string; focus: string; next: string };
export const emptyReviewDraft = (): ReviewDraft => ({ evidence: '', changed: '', focus: '', next: '' });
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (scope: string) => `niansheng-review-draft:v1:${scope}`;

export function readReviewDraft(storage: DraftStorage, scope: string): ReviewDraft {
  const raw = storage.getItem(key(scope));
  if (!raw) return emptyReviewDraft();
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== 'object') throw new Error('回顾草稿格式无效');
  const draft = emptyReviewDraft();
  for (const field of Object.keys(draft) as (keyof ReviewDraft)[]) {
    const value = (saved as Record<string, unknown>)[field];
    if (typeof value !== 'string') throw new Error('回顾草稿格式无效');
    draft[field] = value;
  }
  return draft;
}

export function writeReviewDraft(storage: DraftStorage, scope: string, draft: ReviewDraft) {
  if (Object.values(draft).some(Boolean)) storage.setItem(key(scope), JSON.stringify(draft));
  else storage.removeItem(key(scope));
}
