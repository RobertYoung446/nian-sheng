import { env } from 'cloudflare:workers';
import { applyOperation, emptyWorkspace, normalizeIdea, parseBackup, WorkspaceError, type Operation, type Snapshot } from '../lib/workspace';
import type { IdeaRow } from './ideas';
import { publicAction, type ActionRow } from './actions';

type Row = { payload: string; revision: number; updated_at: number };
export async function readWorkspace(userId: string): Promise<Snapshot> {
  let row = await env.DB.prepare('SELECT payload,revision,updated_at FROM workspace_documents WHERE user_id=?').bind(userId).first<Row>();
  if (!row) {
    const [ideas, actions] = await Promise.all([
      env.DB.prepare('SELECT * FROM ideas WHERE user_id=? ORDER BY updated_at DESC').bind(userId).all<IdeaRow>(),
      env.DB.prepare('SELECT * FROM actions WHERE user_id=? ORDER BY created_at ASC').bind(userId).all<ActionRow>(),
    ]);
    const workspace = emptyWorkspace();
    workspace.ideas = ideas.results.map(i => normalizeIdea({ ...i, tags: JSON.parse(i.tags || '[]'), createdAt: i.created_at, updatedAt: i.updated_at, nextAction: i.next_action }));
    workspace.actions = actions.results.filter(a => workspace.ideas.some(i => i.id === a.idea_id)).map(a => ({ ...publicAction(a), estimateMinutes: a.estimate_minutes || 30, outcome: a.outcome || '', learning: a.learning || '', status: a.status as 'todo' | 'doing' | 'done' | 'cancelled', version: 1 }));
    await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents (user_id,payload,revision,updated_at,last_operation) VALUES (?,?,0,?,?)').bind(userId, JSON.stringify(workspace), Date.now(), '').run();
    row = await env.DB.prepare('SELECT payload,revision,updated_at FROM workspace_documents WHERE user_id=?').bind(userId).first<Row>();
  }
  if (!row) throw new WorkspaceError('空间暂时无法读取，请稍后重试', 'STORAGE');
  return { workspace: parseBackup(JSON.parse(row.payload)), revision: row.revision, updatedAt: row.updated_at };
}

export async function writeOperation(userId: string, operation: Operation): Promise<Snapshot> {
  const receipt = `${userId}:${operation.id}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const done = await env.DB.prepare('SELECT id FROM workspace_receipts WHERE id=? AND user_id=?').bind(receipt, userId).first();
    if (done) return readWorkspace(userId);
    const snapshot = await readWorkspace(userId);
    const workspace = applyOperation(snapshot.workspace, operation);
    const payload = JSON.stringify(workspace);
    if (new TextEncoder().encode(payload).byteLength > 1_500_000) throw new WorkspaceError('空间已超过当前云端容量（1.5 MB）；本机操作仍会保留，请先导出备份并联系支持', 'CAPACITY');
    const now = Date.now();
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE workspace_documents SET payload=?,revision=revision+1,updated_at=?,last_operation=? WHERE user_id=? AND revision=?').bind(payload, now, operation.id, userId, snapshot.revision),
      env.DB.prepare('INSERT OR IGNORE INTO workspace_receipts (id,user_id,created_at) SELECT ?,?,? FROM workspace_documents WHERE user_id=? AND last_operation=?').bind(receipt, userId, now, userId, operation.id),
    ]);
    if (results[0].meta.changes === 1) return { workspace, revision: snapshot.revision + 1, updatedAt: now };
  }
  throw new WorkspaceError('另一端正在更新空间，请重试；本机操作已保留', 'BUSY');
}
