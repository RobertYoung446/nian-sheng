export type View = 'today' | 'ideas' | 'actions' | 'review';
export function workspaceLocation(search: string) {
  const params = new URLSearchParams(search), raw = params.get('view');
  const view: View = raw === 'projects' ? 'actions' : raw === 'inbox' || raw === 'network' ? 'ideas' : raw === 'ideas' || raw === 'actions' || raw === 'review' ? raw : 'today';
  const idea = params.get('idea');
  return { view, idea, capture: !idea && params.get('capture') === '1' };
}
export function workspaceUrl(href: string, view: View, idea: string | null, capture = false) {
  const url = new URL(href);
  url.searchParams.set('view', view);
  if (idea) url.searchParams.set('idea', idea); else url.searchParams.delete('idea');
  if (capture && !idea) url.searchParams.set('capture', '1'); else url.searchParams.delete('capture');
  return url;
}
