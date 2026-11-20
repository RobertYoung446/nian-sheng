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
export async function readLocal(scope: string): Promise<LocalEnvelope> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('spaces', 'readonly'), request = tx.objectStore('spaces').get(scope);
    request.onsuccess = () => {
      try {
        const envelope = request.result as LocalEnvelope | undefined;
        if (!envelope) return resolve(emptyEnvelope());
        parseBackup(envelope.snapshot.workspace); resolve(envelope);
      } catch { reject(new Error('本机数据需要恢复，请保留浏览器数据并导入备份')); }
    };
    request.onerror = () => reject(new Error('本机数据读取失败'));
  });
}
export async function writeLocal(scope: string, envelope: LocalEnvelope): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('spaces', 'readwrite'); tx.objectStore('spaces').put(envelope, scope);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('本机保存失败，可能空间不足；请保留输入并导出已有记录')); tx.onabort = () => reject(new Error('本机保存被中断，请重试'));
  });
}
export async function clearLocal(scope: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('spaces', 'readwrite'); tx.objectStore('spaces').delete(scope);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('清理本机副本失败，请重试'));
  });
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
export async function legacyBackup(): Promise<Workspace | null> {
  const guest = await readLocal('guest');
  if (guest.snapshot.workspace.ideas.length) return guest.snapshot.workspace;
  const workspace = readLegacyWorkspace();
  return workspace?.ideas.length ? workspace : null;
}
export async function migrateLegacyGuest(): Promise<LocalEnvelope> {
  const envelope = await readLocal('guest');
  if (envelope.snapshot.workspace.ideas.length) return envelope;
  const workspace = readLegacyWorkspace();
  if (!workspace?.ideas.length) return envelope;
  const migrated = { ...envelope, snapshot: { workspace, revision: 0, updatedAt: Date.now() } };
  await writeLocal('guest', migrated); return migrated;
}
export function downloadBackup(workspace: Workspace, prefix = '念生备份') {
  const blob = new Blob([JSON.stringify(exportBackup(workspace), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
