export type Intent = '探索' | '创作' | '学习' | '生活';
export type IdeaStatus = '待整理' | '待验证' | '计划中' | '行动中' | '已完成' | '已搁置' | '已归档';
export type Idea = {
  id: string; title: string; content: string; summary: string; tags: string[];
  status: IdeaStatus; intent: Intent; pinned: boolean; version: number;
  createdAt: number; updatedAt: number; archivedFrom?: IdeaStatus;
  feasibility: number; impact: number; clarity: number; confidence: number;
  risk: string; nextAction: string;
};
export type Action = {
  id: string; ideaId: string; description: string; doneDefinition: string;
  estimateMinutes: number; status: 'todo' | 'doing' | 'done' | 'cancelled';
  outcome: string; learning: string; createdAt: number; updatedAt: number;
  startedAt: number | null; completedAt: number | null; version: number;
};
export type Note = {
  id: string; ideaId: string; kind: '结论' | '证据' | '讨论'; content: string;
  url: string; source: '用户' | 'AI'; createdAt: number;
};
type IdeaRevision = { title: string; content: string; tags?: string[]; intent?: Intent };
export type WorkspaceEvent = {
  id: string; ideaId: string; kind: string; at: number;
  before?: IdeaRevision; after?: IdeaRevision; reason?: string; goal?: string;
};
export type Review = { id: string; week: number; evidence: string; changed: string; focus: string; next: string; createdAt: number };
export type Workspace = { schemaVersion: 2; ideas: Idea[]; actions: Action[]; notes: Note[]; events: WorkspaceEvent[]; reviews: Review[] };
export type Operation = { id: string; type: 'capture' | 'edit' | 'status' | 'action.create' | 'action.update' | 'note' | 'review' | 'import'; at: number; data: Record<string, unknown>; baseVersion?: number };
export type Snapshot = { workspace: Workspace; revision: number; updatedAt: number };
export function parseSnapshot(value: unknown): Snapshot {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof v.revision !== 'number' || typeof v.updatedAt !== 'number') throw new WorkspaceError('云端返回的版本格式无效');
  return { workspace: parseBackup(v.workspace), revision: v.revision, updatedAt: v.updatedAt };
}
export const statuses: IdeaStatus[] = ['待整理', '待验证', '计划中', '行动中', '已完成', '已搁置', '已归档'];
export const intents: Intent[] = ['探索', '创作', '学习', '生活'];
export const emptyWorkspace = (): Workspace => ({ schemaVersion: 2, ideas: [], actions: [], notes: [], events: [], reviews: [] });
export class WorkspaceError extends Error {
  code: string;
  constructor(message: string, code = 'INVALID') { super(message); this.code = code; }
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const string = (v: unknown, max = 12000) => {
  if (typeof v !== 'string') return '';
  if (v.length > max) throw new WorkspaceError(`内容超过 ${max} 字符，原输入已保留，请缩短后重试`);
  return v.trim();
};
const importedText = (v: unknown) => typeof v === 'string' ? v : '';
const number = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const list = (v: unknown) => Array.isArray(v) ? v : [];
const validId = (v: unknown) => typeof v === 'string' && /^[\w.-]{1,120}$/.test(v);
const assert = (condition: unknown, message: string, code?: string): void => { if (!condition) throw new WorkspaceError(message, code); };
export function normalizeIdea(value: unknown, now = Date.now()): Idea {
  const v = record(value);
  assert(validId(v.id) && typeof v.content === 'string', '备份中的想法格式无效');
  return {
    id: String(v.id), title: importedText(v.title) || importedText(v.content).slice(0, 30) || '未命名想法', content: importedText(v.content),
    summary: importedText(v.summary), tags: list(v.tags).filter((t): t is string => typeof t === 'string'),
    status: statuses.includes(v.status as IdeaStatus) ? v.status as IdeaStatus : '待整理',
    intent: intents.includes(v.intent as Intent) ? v.intent as Intent : '探索', pinned: v.pinned === true,
    version: Math.max(1, number(v.version, 1)), createdAt: number(v.createdAt, now), updatedAt: number(v.updatedAt, now),
    archivedFrom: statuses.includes(v.archivedFrom as IdeaStatus) ? v.archivedFrom as IdeaStatus : '待整理',
    feasibility: number(v.feasibility, 0), impact: number(v.impact, 0), clarity: number(v.clarity, 0), confidence: number(v.confidence, 0),
    risk: importedText(v.risk), nextAction: importedText(v.nextAction),
  };
}
function parseRevision(value: unknown): IdeaRevision | undefined {
  const revision = record(value);
  if (typeof revision.content !== 'string') return;
  return {
    title: importedText(revision.title), content: revision.content,
    ...(Array.isArray(revision.tags) ? { tags: revision.tags.filter((tag): tag is string => typeof tag === 'string') } : {}),
    ...(intents.includes(revision.intent as Intent) ? { intent: revision.intent as Intent } : {}),
  };
}
function timelineDetails(value: Record<string, unknown>) {
  const before = parseRevision(value.before);
  const after = parseRevision(value.after);
  const reason = importedText(value.reason);
  const goal = importedText(value.goal);
  return {
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(reason ? { reason } : {}),
    ...(goal ? { goal } : {}),
  };
}
export function parseBackup(value: unknown): Workspace {
  const root = record(value);
  const v = record(root.workspace || root.data || value);
  if (v.schemaVersion !== undefined && v.schemaVersion !== 2) throw new WorkspaceError('备份版本暂不支持，请先保留原文件');
  const rawIdeas = Array.isArray(value) ? value : v.ideas;
  assert(Array.isArray(rawIdeas), '这不是有效的念生备份');
  const ideas = (rawIdeas as unknown[]).map(i => normalizeIdea(i));
  assert(ideas.every(i => !i.id.startsWith('sample-')), '示例数据不能导入个人空间');
  assert(new Set(ideas.map(i => i.id)).size === ideas.length, '备份中存在重复想法 ID');
  const ids = new Set(ideas.map(i => i.id));
  const actions: Action[] = list(v.actions).map(value => {
    const a = record(value);
    assert(validId(a.id) && ids.has(String(a.ideaId)) && ['todo', 'doing', 'done', 'cancelled'].includes(String(a.status)), '备份中的行动或关联无效');
    return { id: String(a.id), ideaId: String(a.ideaId), description: importedText(a.description), doneDefinition: importedText(a.doneDefinition),
      estimateMinutes: Math.min(1440, Math.max(5, number(a.estimateMinutes, 30))), status: a.status as Action['status'], outcome: importedText(a.outcome), learning: importedText(a.learning),
      createdAt: number(a.createdAt, Date.now()), updatedAt: number(a.updatedAt, Date.now()), startedAt: typeof a.startedAt === 'number' ? a.startedAt : null,
      completedAt: typeof a.completedAt === 'number' ? a.completedAt : null, version: Math.max(1, number(a.version, 1)) };
  });
  assert(new Set(actions.map(a => a.id)).size === actions.length, '备份中存在重复行动 ID');
  const active = actions.filter(a => a.status === 'todo' || a.status === 'doing');
  assert(new Set(active.map(a => a.ideaId)).size === active.length, '同一想法存在多个未完成行动，请先整理备份');
  const notes: Note[] = list(v.notes).map(value => {
    const n = record(value);
    assert(validId(n.id) && ids.has(String(n.ideaId)) && ['结论', '证据', '讨论'].includes(String(n.kind)), '备份中的记录无效');
    return { id: String(n.id), ideaId: String(n.ideaId), kind: n.kind as Note['kind'], content: importedText(n.content), url: safeUrl(n.url), source: n.source === 'AI' ? 'AI' : '用户', createdAt: number(n.createdAt, Date.now()) };
  });
  const events: WorkspaceEvent[] = list(v.events).map(value => {
    const e = record(value);
    assert(validId(e.id) && ids.has(String(e.ideaId)), '备份中的历史事件无效');
    return { id: String(e.id), ideaId: String(e.ideaId), kind: importedText(e.kind), at: number(e.at, Date.now()), ...timelineDetails(e) };
  });
  if (v.schemaVersion === undefined) {
    const eventIds = new Set(events.map(event => event.id));
    let nextLegacyEvent = 0;
    (rawIdeas as unknown[]).forEach((rawIdea, index) => {
      const idea = ideas[index];
      for (const rawEntry of list(record(rawIdea).history)) {
        const entry = record(rawEntry);
        if (!Object.keys(entry).length) continue;
        let id: string;
        do { id = `legacy-event-${++nextLegacyEvent}`; } while (eventIds.has(id));
        eventIds.add(id);
        events.push({
          id, ideaId: idea.id, kind: entry.ai === true ? '旧版 AI 重新评估' : '旧版原文修订',
          at: number(entry.at, idea.updatedAt), ...timelineDetails(entry),
        });
      }
    });
  }
  const reviews: Review[] = list(v.reviews).map(value => {
    const r = record(value); assert(validId(r.id), '复盘格式无效');
    return { id: String(r.id), week: number(r.week, 0), evidence: importedText(r.evidence), changed: importedText(r.changed), focus: importedText(r.focus), next: importedText(r.next), createdAt: number(r.createdAt, Date.now()) };
  });
  for (const group of [notes, events, reviews]) assert(new Set(group.map(n => n.id)).size === group.length, '备份中存在重复记录 ID');
  return { schemaVersion: 2, ideas, actions, notes, events, reviews };
}
export async function readBackupFile(file: Blob): Promise<Workspace> {
  const text = await file.text();
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new WorkspaceError('无法读取备份 JSON，请检查文件并保留原件'); }
  return parseBackup(value);
}
export function safeUrl(value: unknown): string {
  const text = string(value, 2000); if (!text) return '';
  try { const url = new URL(text); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function newIdea(content: string, id: string, at: number): Idea {
  return normalizeIdea({ id, content, title: content.replace(/\s+/g, ' ').slice(0, 30), status: '待整理', createdAt: at, updatedAt: at }, at);
}
export function currentAction(workspace: Workspace, ideaId: string) {
  return workspace.actions.find(a => a.ideaId === ideaId && (a.status === 'todo' || a.status === 'doing'));
}
export function applyOperation(input: Workspace, operation: Operation): Workspace {
  assert(validId(operation.id) && Number.isFinite(operation.at), '操作格式无效');
  const w = structuredClone(input), d = operation.data, at = operation.at;
  if (w.events.some(e => e.id === operation.id)) return w;
  if (operation.type === 'import') {
    const incoming = parseBackup(d.workspace);
    for (const key of ['ideas', 'actions', 'notes', 'events', 'reviews'] as const) {
      const existing = new Set(w[key].map(v => v.id));
      assert(incoming[key].every(v => !existing.has(v.id)), '导入 ID 与现有数据冲突，请使用副本导入', 'CONFLICT');
      const target = w[key] as {id: string}[];
      for (const item of incoming[key]) target.push(item);
    }
    return w;
  }
  if (operation.type === 'review') {
    const r = record(d.review); assert(validId(r.id), '复盘格式无效');
    assert(!w.reviews.some(v => v.id === r.id), '复盘已保存');
    w.reviews.push({ id: String(r.id), week: number(r.week, at), evidence: string(r.evidence), changed: string(r.changed), focus: string(r.focus), next: string(r.next), createdAt: at }); return w;
  }
  if (operation.type === 'capture') {
    const content = string(d.content); assert(content, '先写下一点什么吧'); assert(validId(d.id) && !String(d.id).startsWith('sample-'), '想法 ID 无效');
    assert(!w.ideas.some(i => i.id === d.id), '想法已经存在', 'CONFLICT');
    w.ideas.unshift(newIdea(content, String(d.id), at));
    w.events.push({ id: operation.id, ideaId: String(d.id), kind: '捕捉想法', at }); return w;
  }
  const idea = w.ideas.find(i => i.id === d.ideaId); assert(idea, '想法不存在');
  const target = idea!;
  const before = operation.type === 'edit' ? { title: target.title, content: target.content, tags: [...target.tags], intent: target.intent } : undefined;
  if (operation.type === 'edit' || operation.type === 'status' || operation.type === 'action.create') {
    assert(operation.baseVersion === target.version, '这个想法已在另一端修改，已保留本机副本', 'CONFLICT');
  }
  if (operation.type === 'edit') {
    assert(string(d.title, 160) && string(d.content), '标题和原文不能为空');
    target.title = string(d.title, 160); target.content = string(d.content);
    target.tags = list(d.tags).filter((v): v is string => typeof v === 'string').slice(0, 12).map(t => t.slice(0, 30));
    target.intent = intents.includes(d.intent as Intent) ? d.intent as Intent : target.intent;
    target.pinned = typeof d.pinned === 'boolean' ? d.pinned : target.pinned;
    target.summary = typeof d.summary === 'string' ? string(d.summary, 1200) : target.summary;
    target.risk = typeof d.risk === 'string' ? string(d.risk, 1200) : target.risk;
    target.nextAction = typeof d.nextAction === 'string' ? string(d.nextAction, 500) : target.nextAction;
  } else if (operation.type === 'status') {
    assert(statuses.includes(d.status as IdeaStatus), '状态无效');
    const status = d.status as IdeaStatus;
    if (status === '行动中' || status === '计划中') throw new WorkspaceError('请通过创建或开始行动进入这个阶段');
    if (status === '待验证' || status === '待整理') assert(!currentAction(w, target.id), '请先完成或取消当前行动，再调整想法阶段');
    if (status === '已完成') assert(w.actions.some(a => a.ideaId === target.id && a.status === 'done' && a.outcome) || string(d.reason), '结束前请记录结果或结束原因');
    if (status === '已归档') target.archivedFrom = target.status;
    if (['已完成', '已搁置', '已归档'].includes(status)) {
      w.actions.filter(a => a.ideaId === target.id && ['todo', 'doing'].includes(a.status)).forEach(a => { a.status = 'cancelled'; a.updatedAt = at; a.version++; });
    }
    target.status = status;
    if (string(d.reason)) w.notes.push({ id: `${operation.id}-reason`, ideaId: target.id, kind: '结论', content: string(d.reason), source: '用户', url: '', createdAt: at });
  } else if (operation.type === 'action.create') {
    assert(!['已归档', '已完成', '已搁置'].includes(target.status), '请先重新激活这个想法');
    assert(!currentAction(w, target.id), '请先完成或取消当前行动');
    assert(validId(d.id) && string(d.description, 500) && string(d.doneDefinition, 500), '请填写下一步和完成标准');
    assert(!w.actions.some(a => a.id === d.id), '行动 ID 已存在', 'CONFLICT');
    w.actions.push({ id: String(d.id), ideaId: target.id, description: string(d.description, 500), doneDefinition: string(d.doneDefinition, 500), estimateMinutes: Math.min(1440, Math.max(5, number(d.estimateMinutes, 30))), status: 'todo', outcome: '', learning: '', createdAt: at, updatedAt: at, startedAt: null, completedAt: null, version: 1 });
    target.status = '计划中'; target.nextAction = string(d.description, 500);
  } else if (operation.type === 'action.update') {
    const action = w.actions.find(a => a.id === d.id && a.ideaId === target.id); assert(action, '行动不存在');
    assert(operation.baseVersion === action!.version, '这个行动已在另一端修改，已保留本机副本', 'CONFLICT');
    assert(['todo', 'doing', 'done', 'cancelled'].includes(String(d.status)), '行动状态无效');
    const supplement = action!.status === 'done' && d.status === 'done';
    assert(['todo', 'doing'].includes(action!.status) || supplement, '这个行动已结束，请创建下一步');
    if (d.status === 'done') assert(string(d.outcome), '写下一句实际结果，就能完成这一步');
    action!.status = d.status as Action['status']; action!.outcome = string(d.outcome); action!.learning = string(d.learning);
    action!.startedAt = d.status === 'doing' ? action!.startedAt || at : action!.startedAt;
    action!.completedAt = d.status === 'done' ? action!.completedAt || at : null; action!.updatedAt = at; action!.version++;
    if (!supplement) { target.status = d.status === 'doing' ? '行动中' : '待验证'; if (d.status === 'todo') target.status = '计划中'; }
  } else if (operation.type === 'note') {
    assert(validId(d.id) && string(d.content) && ['结论', '证据', '讨论'].includes(String(d.kind)), '请填写有效的记录');
    assert(!w.notes.some(n => n.id === d.id), '记录已存在', 'CONFLICT');
    w.notes.push({ id: String(d.id), ideaId: target.id, kind: d.kind as Note['kind'], content: string(d.content), url: safeUrl(d.url), source: d.source === 'AI' ? 'AI' : '用户', createdAt: at });
  } else throw new WorkspaceError('暂不支持这个操作');
  target.updatedAt = at; target.version++;
  w.events.push({ id: operation.id, ideaId: target.id, kind: operation.type === 'action.update' ? `行动${d.status === 'done' ? '完成' : d.status === 'doing' ? '开始' : '调整'}` : operation.type === 'status' ? `设为${target.status}` : operation.type === 'edit' ? '修改想法' : operation.type === 'note' ? '保存记录' : '创建行动', at, ...(before ? { before } : {}) });
  return w;
}
export function weekRange(now = Date.now()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return { start: start.getTime(), end: now };
}
export function weekStats(workspace: Workspace, now = Date.now()) {
  const { start, end } = weekRange(now), within = (n: number | null) => n !== null && n >= start && n <= end;
  return { start, end, captured: workspace.ideas.filter(i => within(i.createdAt)).length,
    completed: workspace.actions.filter(a => a.status === 'done' && within(a.completedAt)).length,
    learned: workspace.actions.filter(a => a.status === 'done' && a.learning && within(a.completedAt)).length,
    evidence: workspace.notes.filter(n => n.kind === '证据' && within(n.createdAt)).length };
}
export function focusIdea(workspace: Workspace) {
  return workspace.ideas.filter(i => !['已归档', '已搁置', '已完成'].includes(i.status)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(!!currentAction(workspace, b.id)) - Number(!!currentAction(workspace, a.id)) || Number(b.status === '行动中') - Number(a.status === '行动中') || b.updatedAt - a.updatedAt)[0];
}
export function progressLabel(workspace: Workspace, ideaId: string) {
  if (workspace.actions.some(a => a.ideaId === ideaId && a.status === 'done')) return '已有实际结果';
  if (currentAction(workspace, ideaId)) return '下一步已明确';
  if (workspace.notes.some(n => n.ideaId === ideaId && n.kind === '证据')) return '已有参考证据';
  return '等待澄清';
}
export function copyWorkspace(input: Workspace, suffix = ''): Workspace {
  const w = structuredClone(input), ids = new Map(w.ideas.map(i => [i.id, crypto.randomUUID()]));
  w.ideas = w.ideas.map(i => ({ ...i, id: ids.get(i.id)!, title: suffix ? `${i.title}${suffix}`.slice(0, 160) : i.title, version: 1 }));
  w.actions = w.actions.map(a => ({ ...a, id: crypto.randomUUID(), ideaId: ids.get(a.ideaId)!, version: 1 }));
  w.notes = w.notes.map(n => ({ ...n, id: crypto.randomUUID(), ideaId: ids.get(n.ideaId)! }));
  w.events = w.events.map(e => ({ ...e, id: crypto.randomUUID(), ideaId: ids.get(e.ideaId)! }));
  w.reviews = w.reviews.map(r => ({ ...r, id: crypto.randomUUID() })); return w;
}
export function exportBackup(workspace: Workspace) { return { application: '念生', exportedAt: new Date().toISOString(), workspace }; }
