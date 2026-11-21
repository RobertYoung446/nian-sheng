import { env } from 'cloudflare:workers';
import { applyOperation, emptyWorkspace, normalizeIdea, parseBackup, WorkspaceError, type Operation, type Snapshot } from '../lib/workspace';
import { splitWorkspacePayload, WORKSPACE_MAX_BYTES, WORKSPACE_MAX_MB } from '../lib/workspace-capacity';
import type { IdeaRow } from './ideas';
import { publicAction, type ActionRow } from './actions';

type Row = { legacy_payload: string | null; part_count: number | null; position: number | null; part: string | null; revision: number; updated_at: number };
const encoder = new TextEncoder();

async function findWorkspace(userId: string): Promise<Snapshot | undefined> {
  const { results } = await env.DB.prepare(`
    SELECT CASE WHEN d.payload NOT LIKE 'parts:%' THEN d.payload END AS legacy_payload,
           CASE WHEN d.payload LIKE 'parts:%' THEN CAST(substr(d.payload, 7) AS INTEGER) END AS part_count,
           p.position, p.payload AS part, d.revision, d.updated_at
    FROM workspace_documents d
    LEFT JOIN workspace_document_parts p ON p.user_id = d.user_id
    WHERE d.user_id = ? ORDER BY p.position`).bind(userId).all<Row>();
  const row = results[0];
  if (!row) return;
  let payload = row.legacy_payload;
  if (payload === null) {
    if (results.length !== row.part_count || results.some((part, i) => part.position !== i || part.part === null)) {
      throw new WorkspaceError('云端空间不完整，本机记录已保留', 'STORAGE');
    }
    payload = results.map(part => part.part).join('');
  }
  return { workspace: parseBackup(JSON.parse(payload)), revision: row.revision, updatedAt: row.updated_at };
}

export async function readWorkspace(userId: string): Promise<Snapshot> {
  let row = await findWorkspace(userId);
  if (!row) {
    const [ideas, actions] = await Promise.all([
      env.DB.prepare('SELECT * FROM ideas WHERE user_id=? ORDER BY updated_at DESC').bind(userId).all<IdeaRow>(),
      env.DB.prepare('SELECT * FROM actions WHERE user_id=? ORDER BY created_at ASC').bind(userId).all<ActionRow>(),
    ]);
    const workspace = emptyWorkspace();
    workspace.ideas = ideas.results.map(i => normalizeIdea({ ...i, tags: JSON.parse(i.tags || '[]'), createdAt: i.created_at, updatedAt: i.updated_at, nextAction: i.next_action }));
    workspace.actions = actions.results.filter(a => workspace.ideas.some(i => i.id === a.idea_id)).map(a => ({ ...publicAction(a), estimateMinutes: a.estimate_minutes || 30, outcome: a.outcome || '', learning: a.learning || '', status: a.status as 'todo' | 'doing' | 'done' | 'cancelled', version: 1 }));
    await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents (user_id,payload,revision,updated_at,last_operation) VALUES (?,?,0,?,?)').bind(userId, JSON.stringify(workspace), Date.now(), '').run();
    row = await findWorkspace(userId);
  }
  if (!row) throw new WorkspaceError('空间暂时无法读取，请稍后重试', 'STORAGE');
  return row;
}

export async function writeOperation(userId: string, operation: Operation): Promise<Snapshot> {
  const receipt = `${userId}:${operation.id}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const done = await env.DB.prepare('SELECT id FROM workspace_receipts WHERE id=? AND user_id=?').bind(receipt, userId).first();
    if (done) return readWorkspace(userId);
    const snapshot = await readWorkspace(userId);
    const workspace = applyOperation(snapshot.workspace, operation);
    const payload = JSON.stringify(workspace);
    if (encoder.encode(payload).byteLength > WORKSPACE_MAX_BYTES) {
      throw new WorkspaceError(`空间超过当前云端容量（${WORKSPACE_MAX_MB} MB）；本机操作仍会保留，请先导出备份`, 'CAPACITY');
    }
    const parts = splitWorkspacePayload(payload);
    const now = Date.now();
    // A unique token ties every statement to this attempt's successful update,
    // including when two requests retry the same operation concurrently.
    const writeToken = crypto.randomUUID();
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE workspace_documents SET payload=?,revision=revision+1,updated_at=?,last_operation=? WHERE user_id=? AND revision=?')
        .bind(`parts:${parts.length}`, now, writeToken, userId, snapshot.revision),
      ...parts.map((part, position) => env.DB.prepare(`
        INSERT INTO workspace_document_parts(user_id, position, payload)
        SELECT user_id, ?, ? FROM workspace_documents WHERE user_id=? AND last_operation=?
        ON CONFLICT(user_id, position) DO UPDATE SET payload=excluded.payload
        WHERE workspace_document_parts.payload <> excluded.payload`).bind(position, part, userId, writeToken)),
      env.DB.prepare(`DELETE FROM workspace_document_parts WHERE user_id=? AND position>=?
        AND EXISTS (SELECT 1 FROM workspace_documents WHERE user_id=? AND last_operation=?)`)
        .bind(userId, parts.length, userId, writeToken),
      env.DB.prepare('INSERT OR IGNORE INTO workspace_receipts (id,user_id,created_at) SELECT ?,?,? FROM workspace_documents WHERE user_id=? AND last_operation=?')
        .bind(receipt, userId, now, userId, writeToken),
    ]);
    if (results[0].meta.changes === 1) return { workspace, revision: snapshot.revision + 1, updatedAt: now };
  }
  throw new WorkspaceError('另一端正在更新空间，请重试；本机操作已保留', 'BUSY');
}
