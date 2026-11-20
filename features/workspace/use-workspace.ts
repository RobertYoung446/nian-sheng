'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyOperation, copyWorkspace, emptyWorkspace, parseSnapshot, type Operation, type Workspace } from '../../lib/workspace';
import { apiMessage, readApi, syncFailureMessage } from '../../lib/api-client';
import { migrateLegacyGuest, readLocal, rebase, writeLocal, type LocalEnvelope } from '../../lib/local-store';

export type WorkspaceUser = { id: string; name: string } | null;
export type SyncState = 'loading' | 'local' | 'synced' | 'pending' | 'offline' | 'auth' | 'conflict' | 'error';
export function useWorkspace(user: WorkspaceUser) {
  const scope = user ? `account:${user.id}` : 'guest';
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [state, setState] = useState<SyncState>('loading');
  const [pending, setPending] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const alive = useRef(true);
  const broadcast = useRef<BroadcastChannel | null>(null);
  const serial = useRef(Promise.resolve());
  const locked = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    if (navigator.locks) return navigator.locks.request(`niansheng:${scope}`, task);
    const previous = serial.current;
    let release!: () => void;
    serial.current = new Promise<void>(resolve => { release = resolve; });
    await previous; try { return await task(); } finally { release(); }
  }, [scope]);
  const show = useCallback((envelope: LocalEnvelope) => {
    if (!alive.current) return;
    setWorkspace(envelope.snapshot.workspace); setPending(envelope.pending.length); setUpdatedAt(envelope.snapshot.updatedAt);
  }, []);
  const sync = useCallback(async () => {
    if (!user) return;
    await locked(async () => {
      try {
        let envelope = await readLocal(scope);
        if (envelope.conflict) { show(envelope); setState('conflict'); return; }
        if (!navigator.onLine) { setState('offline'); return; }
        setState(envelope.pending.length ? 'pending' : 'loading');
        while (envelope.pending.length) {
          const response = await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: envelope.pending[0] }), signal: AbortSignal.timeout(15000) });
          const result = await readApi(response);
          if (response.status === 401) { setState('auth'); setError('登录已过期，本机记录仍在；登录后继续同步'); return; }
          if (response.status === 409) {
            envelope.conflict = parseSnapshot(result.snapshot); await writeLocal(scope, envelope); show(envelope); setState('conflict'); return;
          }
          if (!response.ok) throw new Error(apiMessage(result, '云端暂时不可用，本机记录已保留'));
          const snapshot = parseSnapshot(result);
          const remaining = envelope.pending.slice(1);
          try { envelope = { ...envelope, snapshot: rebase(snapshot, remaining), pending: remaining }; }
          catch { envelope = { ...envelope, pending: remaining, conflict: snapshot }; await writeLocal(scope, envelope); show(envelope); setState('conflict'); return; }
          await writeLocal(scope, envelope); show(envelope);
        }
        const response = await fetch('/api/workspace', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const result = await readApi(response);
        if (response.status === 401) { setState('auth'); setError('登录已过期，本机记录仍在；登录后继续同步'); return; }
        if (!response.ok) throw new Error(apiMessage(result, '云端读取失败'));
        envelope.snapshot = parseSnapshot(result);
        await writeLocal(scope, envelope); show(envelope); setError(''); setState('synced');
        broadcast.current?.postMessage('updated');
      } catch (e) { setState(navigator.onLine ? 'error' : 'offline'); setError(syncFailureMessage(e)); }
    });
  }, [locked, scope, show, user]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const initialize = async () => {
      try {
        const envelope = await locked(() => user ? readLocal(scope) : migrateLegacyGuest());
        if (cancelled) return;
        show(envelope); setReady(true); setState(user ? 'pending' : 'local');
        if (user) { localStorage.setItem('niansheng-last-account', JSON.stringify(user)); void sync(); }
      } catch (e) { setError(e instanceof Error ? e.message : '本机存储不可用'); setState('error'); }
    };
    void initialize();
    const onOnline = () => void sync();
    const onOffline = () => { if (user) setState('offline'); };
    const onFocus = () => void sync();
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); window.addEventListener('focus', onFocus);
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`niansheng:${scope}`) : null;
    broadcast.current = channel;
    if (channel) channel.onmessage = () => { void locked(async () => show(await readLocal(scope))); };
    const interval = user ? setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 30000) : undefined;
    return () => { cancelled = true; alive.current = false; channel?.close(); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('focus', onFocus); if (interval) clearInterval(interval); };
  }, [locked, scope, show, sync, user]);
  const commit = useCallback(async (operation: Operation) => {
    if (!ready) throw new Error('空间尚未就绪，请稍后再保存');
    await locked(async () => {
      const envelope = await readLocal(scope);
      if (envelope.conflict) throw new Error('请先处理同步冲突；已有操作仍保存在本机');
      const next = applyOperation(envelope.snapshot.workspace, operation);
      const changed = { ...envelope, snapshot: { ...envelope.snapshot, workspace: next }, pending: user ? [...envelope.pending, operation] : [] };
      await writeLocal(scope, changed); show(changed); setState(user ? 'pending' : 'local'); setError(''); broadcast.current?.postMessage('updated');
    });
    if (user) void sync();
  }, [locked, ready, scope, show, sync, user]);
  const resolveConflict = useCallback(async () => {
    await locked(async () => {
      const envelope = await readLocal(scope);
      if (!envelope.conflict) return;
      const dirtyIds = new Set(envelope.pending.map(op => String(op.data.ideaId || op.data.id || '')));
      const local = envelope.snapshot.workspace;
      const selected = { ...local, ideas: local.ideas.filter(i => dirtyIds.has(i.id) || envelope.pending.some(op => op.type === 'import')), reviews: local.reviews.filter(r => !envelope.conflict!.workspace.reviews.some(v => v.id === r.id)) };
      const ids = new Set(selected.ideas.map(i => i.id));
      selected.actions = local.actions.filter(a => ids.has(a.ideaId)); selected.notes = local.notes.filter(n => ids.has(n.ideaId)); selected.events = local.events.filter(e => ids.has(e.ideaId));
      const copies = copyWorkspace(selected, '（本机冲突副本）');
      const operation: Operation = { id: crypto.randomUUID(), type: 'import', at: Date.now(), data: { workspace: copies } };
      const next = { snapshot: rebase(envelope.conflict, [operation]), pending: [operation], backup: local };
      await writeLocal(scope, next); show(next); setState('pending');
    });
    void sync();
  }, [locked, scope, show, sync]);
  return { workspace, state, pending, updatedAt, error, ready, commit, sync, resolveConflict, scope };
}
