'use client';
import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { currentAction, progressLabel, type Idea, type Workspace } from '../../lib/workspace';

export function Icon({ name }: { name: 'today' | 'ideas' | 'actions' | 'review' | 'plus' | 'settings' | 'close' }) {
  const paths = { today: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z', ideas: 'M5 4h14v16H5ZM9 8h6M9 12h6M9 16h4', actions: 'm4 12 5 5L20 6', review: 'M4 4v16h17M8 15l4-5 4 2 4-7', plus: 'M12 4v16M4 12h16', settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', close: 'm6 6 12 12M6 18 18 6' };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

type NoticeValue = { notice: string; dismiss: () => void };
export const NoticeContext = createContext<NoticeValue>({ notice: '', dismiss: () => {} });
export function NoticeRegion({ floating = false }: { floating?: boolean }) {
  const { notice, dismiss } = useContext(NoticeContext);
  if (!notice) return null;
  return <div className={floating ? 'ns-toast' : 'ns-inline-notice'} role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={dismiss}>×</button></div>;
}

export function useModalFocus(ref: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const background = document.getElementById('ns-content');
    if (background) background.inert = true;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    (ref.current?.querySelector<HTMLElement>('textarea,input,select') || ref.current?.querySelector<HTMLElement>('button,a[href]'))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])') || []).filter(n => n.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { if (background) background.inert = false; document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previous?.isConnected && previous.focus(); };
  }, [ref]);
}
export function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useModalFocus(ref, close);
  return <div className="ns-scrim" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section ref={ref} className={`ns-dialog ${wide ? 'ns-dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="ns-dialog-head"><h2>{title}</h2><button className="ns-icon-button" onClick={close} aria-label="关闭"><Icon name="close" /></button></header><NoticeRegion />{children}</section></div>;
}
export function IdeaCard({ idea, workspace, open }: { idea: Idea; workspace: Workspace; open: (id: string) => void }) {
  const action = currentAction(workspace, idea.id);
  return <button className="ns-idea-card" onClick={() => open(idea.id)}><span className="ns-card-meta"><span>{idea.intent} · {idea.status}</span><span>{idea.pinned ? '已置顶' : new Date(idea.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</span></span><h3>{idea.title}</h3><p>{idea.summary || idea.content}</p><span className="ns-progress">{progressLabel(workspace, idea.id)}</span><span className="ns-card-next">{action ? `下一步：${action.description}` : '打开想法，慢慢想清楚 →'}</span></button>;
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="ns-empty"><span aria-hidden="true">✦</span><h2>{title}</h2><p>{children}</p>{action}</div>;
}
