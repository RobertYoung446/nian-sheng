import { applyOperation, emptyWorkspace, exportBackup, parseBackup, type Operation, type Snapshot, type Workspace } from './workspace';

export type LocalEnvelope = { snapshot: Snapshot; pending: Operation[]; conflict?: Snapshot; backup?: Workspace };
const emptyEnvelope = (): LocalEnvelope => ({ snapshot: { workspace: emptyWorkspace(), revision: 0, updatedAt: 0 }, pending: [] });
let database: Promise<IDBDatabase> | undefined;
function open() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('niansheng-workspace-v2', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('spaces');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error('本机存储不可用，请检查浏览器存储设置')); };
  });
  return database;
}
type VersionedEnvelope = { envelope: LocalEnvelope; version: string };
function validateEnvelope(value: LocalEnvelope): void {
  if (!value || !value.snapshot || !Array.isArray(value.pending) ||
      !Number.isFinite(value.snapshot.revision) || !Number.isFinite(value.snapshot.updatedAt)) throw new Error('本机空间格式无效');
  parseBackup(value.snapshot.workspace);
}
const storageVersion = (value: LocalEnvelope | undefined) => JSON.stringify(value ?? null);
export async function readLocalVersioned(scope: string): Promise<VersionedEnvelope> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('spaces', 'readonly'), request = tx.objectStore('spaces').get(scope);
    request.onsuccess = () => {
      try {
        const stored = request.result as LocalEnvelope | undefined;
        const envelope = stored ?? emptyEnvelope();
        validateEnvelope(envelope);
        resolve({ envelope, version: storageVersion(stored) });
      } catch { reject(new Error('本机数据需要恢复，请保留浏览器数据并导入备份')); }
    };
    request.onerror = () => reject(new Error('本机数据读取失败'));
  });
}
// Recovery is separate from ordinary reads: a damaged value must never be
// replaced without preserving the exact original in the same transaction.
function damagedVersion(value: unknown): string {
  if (value === undefined) throw new Error('本机空间不存在，请刷新后重试');
  try {
    const envelope = value as LocalEnvelope;
    validateEnvelope(envelope);
  } catch {
    const version = JSON.stringify(value);
    if (typeof version !== 'string') throw new Error('本机数据无法安全检查，请保留浏览器数据');
    return version;
  }
  throw new Error('本机空间已经恢复正常，请刷新后重试');
}
export async function inspectDamagedLocal(scope: string): Promise<string> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('spaces', 'readonly').objectStore('spaces').get(scope);
    request.onsuccess = () => { try { resolve(damagedVersion(request.result)); } catch (error) { reject(error); } };
    request.onerror = () => reject(new Error('本机数据读取失败'));
  });
}
export async function replaceDamagedLocal(scope: string, expected: string, replacement: LocalEnvelope, archiveId: string): Promise<void> {
  if (!(scope === 'guest' || scope.startsWith('account:')) || !/^[\w.-]{1,120}$/.test(archiveId)) throw new Error('恢复参数无效');
  try { validateEnvelope(replacement); } catch { throw new Error('恢复数据无效'); }
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('spaces', 'readwrite'), store = tx.objectStore('spaces');
    let failure: Error | undefined;
    const request = store.get(scope);
    request.onsuccess = () => {
      try {
        const original = request.result;
        if (damagedVersion(original) !== expected) throw new Error('本机空间已更改，请刷新后重新确认；原数据未被覆盖');
        store.add({ scope, archivedAt: Date.now(), original }, `recovery:${scope}:${archiveId}`);
        store.put(replacement, scope);
      } catch (error) { failure = error instanceof Error ? error : new Error('恢复检查失败'); tx.abort(); }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? new Error('本机恢复已中断，原数据未被覆盖'));
    tx.onerror = () => {}; // onabort reports transaction failure after rollback
  });
}
export async function recoveryArchives(scope: string): Promise<unknown[]> {
  if (!(scope === 'guest' || scope.startsWith('account:'))) throw new Error('空间无效');
  const prefix = `recovery:${scope}:`;
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('spaces', 'readonly').objectStore('spaces').getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法读取恢复前的原始数据'));
  });
}
export async function downloadRecoveryArchives(scope: string): Promise<void> {
  const originals = await recoveryArchives(scope);
  if (!originals.length) throw new Error('当前空间没有恢复前的原始数据');
  const blob = new Blob([JSON.stringify({ application: '念生', type: '恢复前原始数据', originals }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `念生恢复前原始数据-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readLocal(scope: string): Promise<LocalEnvelope> {
  return (await readLocalVersioned(scope)).envelope;
}
async function replaceLocal(scope: string, expected: string, envelope?: LocalEnvelope): Promise<string> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('spaces', 'readwrite'), store = tx.objectStore('spaces');
    let stale = false;
    const request = store.get(scope);
    request.onsuccess = () => {
      if (storageVersion(request.result as LocalEnvelope | undefined) !== expected) {
        stale = true; tx.abort(); return;
      }
      if (envelope) store.put(envelope, scope); else store.delete(scope);
    };
    tx.oncomplete = () => resolve(storageVersion(envelope));
    tx.onerror = () => reject(new Error('本机保存失败，可能空间不足；请保留输入并导出已有记录'));
    tx.onabort = () => reject(stale ? Object.assign(new Error('本机空间已在另一页面更改，请刷新后重试；已有记录未被覆盖'), { code: 'LOCAL_STALE' }) : new Error('本机保存被中断，请重试'));
  });
}
export function writeLocal(scope: string, envelope: LocalEnvelope, expected: string): Promise<string> {
  return replaceLocal(scope, expected, envelope);
}
export async function clearLocal(scope: string, expected: string): Promise<void> {
  await replaceLocal(scope, expected);
}
export function rebase(snapshot: Snapshot, pending: Operation[]): Snapshot {
  let workspace = snapshot.workspace;
  for (const operation of pending) workspace = applyOperation(workspace, operation);
  return { ...snapshot, workspace };
}
function readLegacyWorkspace(): Workspace | null {
  const raw = localStorage.getItem('niansheng-public-v1');
  const fallback = localStorage.getItem('niansheng-public-backup-v1');
  if (raw) {
    try { return parseBackup(JSON.parse(raw)); }
    catch (error) { if (!fallback) throw error; }
  }
  return fallback ? parseBackup(JSON.parse(fallback)) : null;
}
function hasPersonalData(workspace: Workspace): boolean {
  return workspace.ideas.length > 0 || workspace.actions.length > 0 || workspace.notes.length > 0
    || workspace.events.length > 0 || workspace.reviews.length > 0;
}
export async function legacyBackup(): Promise<Workspace | null> {
  const guest = await readLocal('guest');
  if (hasPersonalData(guest.snapshot.workspace)) return guest.snapshot.workspace;
  const workspace = readLegacyWorkspace();
  return workspace && hasPersonalData(workspace) ? workspace : null;
}
export async function migrateLegacyGuest(): Promise<LocalEnvelope> {
  const { envelope, version } = await readLocalVersioned('guest');
  if (hasPersonalData(envelope.snapshot.workspace)) return envelope;
  const workspace = readLegacyWorkspace();
  if (!workspace || !hasPersonalData(workspace)) return envelope;
  const migrated = { ...envelope, snapshot: { workspace, revision: 0, updatedAt: Date.now() } };
  await writeLocal('guest', migrated, version); return migrated;
}
export function downloadBackup(workspace: Workspace, prefix = '念生备份') {
  const blob = new Blob([JSON.stringify(exportBackup(workspace), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
