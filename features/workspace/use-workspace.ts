'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyOperation, copyWorkspace, emptyWorkspace, parseSnapshot, type Operation, type Workspace } from '../../lib/workspace';
import { apiMessage, readApi, syncFailureMessage } from '../../lib/api-client';
import { inspectDamagedLocal, migrateLegacyGuest, readLocal, readLocalVersioned, rebase, replaceDamagedLocal, writeLocal, type LocalEnvelope } from '../../lib/local-store';
import { syncStateAfterBroadcast } from '../../lib/sync-broadcast';
import { withWorkspaceLock } from '../../lib/workspace-lock';

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
  const syncing = useRef(false);
  const locked = useCallback(<T,>(task: (assertHeld: () => void) => Promise<T>) => withWorkspaceLock(scope, task), [scope]);
  const show = useCallback((envelope: LocalEnvelope) => {
    if (!alive.current) return;
    setWorkspace(envelope.snapshot.workspace); setPending(envelope.pending.length); setUpdatedAt(envelope.snapshot.updatedAt);
  }, []);
  const sync = useCallback(async () => {
    if (!user || syncing.current) return;
    syncing.current = true;
    try {
      while (alive.current) {
        const captured = await locked(async assertHeld => {
          const local = await readLocalVersioned(scope);
          assertHeld();
          if (local.envelope.conflict) { show(local.envelope); setState('conflict'); return null; }
          if (!navigator.onLine) { setState('offline'); return null; }
          setState(local.envelope.pending.length ? 'pending' : 'loading');
          return local;
        });
        if (!captured) return;
        const operation = captured.envelope.pending[0];
        const response = operation
          ? await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Niansheng-Account': encodeURIComponent(user.id) }, body: JSON.stringify({ operation }), signal: AbortSignal.timeout(15000) })
          : await fetch('/api/workspace', { cache: 'no-store', headers: { 'X-Niansheng-Account': encodeURIComponent(user.id) }, signal: AbortSignal.timeout(15000) });
        const result = await readApi(response);
        const next = await locked(async assertHeld => {
          const current = await readLocalVersioned(scope);
          assertHeld();
          // Another tab or a local edit changed the queue during the request.
          // Retry from the new state; server operation IDs make POST retries safe.
          if (current.version !== captured.version) return 'retry';
          const envelope = current.envelope;
          if (response.status === 401) { setState('auth'); setError(apiMessage(result, '登录已过期，本机记录仍在；登录后继续同步')); return 'done'; }
          if (operation && response.status === 409) {
            envelope.conflict = parseSnapshot(result.snapshot);
            await writeLocal(scope, envelope, current.version); assertHeld(); show(envelope);
            setState('conflict'); broadcast.current?.postMessage('updated'); return 'done';
          }
          if (!response.ok) throw new Error(apiMessage(result, operation ? '云端暂时不可用，本机记录已保留' : '云端读取失败'));
          const snapshot = parseSnapshot(result);
          if (operation) {
            const remaining = envelope.pending.slice(1);
            try { envelope.snapshot = rebase(snapshot, remaining); envelope.pending = remaining; }
            catch {
              envelope.pending = remaining; envelope.conflict = snapshot;
              await writeLocal(scope, envelope, current.version); assertHeld(); show(envelope);
              setState('conflict'); broadcast.current?.postMessage('updated'); return 'done';
            }
            await writeLocal(scope, envelope, current.version); assertHeld(); show(envelope);
            return 'retry';
          }
          envelope.snapshot = snapshot;
          await writeLocal(scope, envelope, current.version); assertHeld(); show(envelope);
          setError(''); setState('synced'); broadcast.current?.postMessage('synced'); return 'done';
        });
        if (next === 'done') return;
      }
    } catch (e) {
      if (alive.current) { setState(navigator.onLine ? 'error' : 'offline'); setError(syncFailureMessage(e)); }
    } finally { syncing.current = false; }
  }, [locked, scope, show, user]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const initialize = async () => {
      try {
        const envelope = await locked(async assertHeld => {
          const local = await (user ? readLocal(scope) : migrateLegacyGuest());
          assertHeld(); return local;
        });
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
    if (channel) channel.onmessage = event => {
      void locked(async assertHeld => {
        const envelope = await readLocal(scope);
        assertHeld();
        show(envelope); setReady(true); setError('');
        if (!user && alive.current) setState('local');
        if (user && alive.current) {
          const nextState = syncStateAfterBroadcast(envelope, event.data);
          if (nextState) setState(nextState);
        }
      }).catch(() => { if (alive.current) { setState('error'); setError('本机数据读取失败，请刷新后重试'); } });
    };
    const interval = user ? setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 30000) : undefined;
    return () => { cancelled = true; alive.current = false; channel?.close(); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('focus', onFocus); if (interval) clearInterval(interval); };
  }, [locked, scope, show, sync, user]);
  const commit = useCallback(async (operation: Operation) => {
    if (!ready) throw new Error('空间尚未就绪，请稍后再保存');
    await locked(async assertHeld => {
      const { envelope, version } = await readLocalVersioned(scope);
      assertHeld();
      if (envelope.conflict) throw new Error('请先处理同步冲突；已有操作仍保存在本机');
      const next = applyOperation(envelope.snapshot.workspace, operation);
      const changed = { ...envelope, snapshot: { ...envelope.snapshot, workspace: next }, pending: user ? [...envelope.pending, operation] : [] };
      await writeLocal(scope, changed, version); assertHeld(); show(changed); setState(user ? 'pending' : 'local'); setError(''); broadcast.current?.postMessage('updated');
    });
    if (user) void sync();
  }, [locked, ready, scope, show, sync, user]);
  const retry = useCallback(async () => {
    if (ready) { await sync(); return; }
    try {
      const envelope = await locked(async assertHeld => {
        const local = await (user ? readLocal(scope) : migrateLegacyGuest());
        assertHeld(); return local;
      });
      if (!alive.current) return;
      show(envelope); setReady(true); setError(''); setState(user ? 'pending' : 'local');
      if (user) void sync();
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : '本机存储不可用'); setState('error'); }
    }
  }, [locked, ready, scope, show, sync, user]);
  const recover = useCallback(async (operation: Operation) => {
    if (ready || operation.type !== 'import') throw new Error('空间状态已变化，请刷新后重试');
    const nextWorkspace = applyOperation(emptyWorkspace(), operation);
    await locked(async assertHeld => {
      const expected = await inspectDamagedLocal(scope);
      assertHeld();
      const restored: LocalEnvelope = { snapshot: { workspace: nextWorkspace, revision: 0, updatedAt: Date.now() }, pending: user ? [operation] : [] };
      await replaceDamagedLocal(scope, expected, restored, crypto.randomUUID());
      assertHeld(); show(restored); setReady(true); setError(''); setState(user ? 'pending' : 'local');
      broadcast.current?.postMessage('updated');
    });
    if (user) void sync();
  }, [locked, ready, scope, show, sync, user]);
  const resolveConflict = useCallback(async () => {
    await locked(async assertHeld => {
      const { envelope, version } = await readLocalVersioned(scope);
      assertHeld();
      if (!envelope.conflict) return;
      const dirtyIds = new Set(envelope.pending.map(op => String(op.data.ideaId || op.data.id || '')));
      const local = envelope.snapshot.workspace;
      const selected = { ...local, ideas: local.ideas.filter(i => dirtyIds.has(i.id) || envelope.pending.some(op => op.type === 'import')), reviews: local.reviews.filter(r => !envelope.conflict!.workspace.reviews.some(v => v.id === r.id)) };
      const ids = new Set(selected.ideas.map(i => i.id));
      selected.actions = local.actions.filter(a => ids.has(a.ideaId)); selected.notes = local.notes.filter(n => ids.has(n.ideaId)); selected.events = local.events.filter(e => ids.has(e.ideaId));
      const copies = copyWorkspace(selected, '（本机冲突副本）');
      const operation: Operation = { id: crypto.randomUUID(), type: 'import', at: Date.now(), data: { workspace: copies } };
      const next = { snapshot: rebase(envelope.conflict, [operation]), pending: [operation], backup: local };
      await writeLocal(scope, next, version); assertHeld(); show(next); setState('pending'); broadcast.current?.postMessage('updated');
    });
    void sync();
  }, [locked, scope, show, sync]);
  return { workspace, state, pending, updatedAt, error, ready, commit, recover, retry, sync, resolveConflict, scope };
}
