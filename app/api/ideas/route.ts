import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { analyzeIdea, ensureIdeasTable, type IdeaRow } from '../../../db/ideas';

function publicIdea(row: IdeaRow) {
  return {
    id: row.id, title: row.title, content: row.content, summary: row.summary,
    tags: JSON.parse(row.tags || '[]'), status: row.status,
    feasibility: row.feasibility, impact: row.impact, clarity: row.clarity,
    confidence: row.confidence, risk: row.risk, nextAction: row.next_action,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  await ensureIdeasTable();
  const result = await env.DB.prepare('SELECT * FROM ideas WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100').bind(user.userId).all<IdeaRow>();
  return Response.json({ ideas: result.results.map(publicIdea) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const { content } = await request.json() as { content?: string };
  if (!content?.trim()) return Response.json({ error: '想法不能为空' }, { status: 400 });
  await ensureIdeasTable();
  const analysis = analyzeIdea(content);
  const now = Date.now();
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO ideas
    (id,user_id,title,content,summary,tags,status,feasibility,impact,clarity,confidence,risk,next_action,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,user.userId,analysis.title,content.trim(),analysis.summary,JSON.stringify(analysis.tags),'待验证',analysis.feasibility,analysis.impact,analysis.clarity,analysis.confidence,analysis.risk,analysis.nextAction,now,now).run();
  const row = await env.DB.prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?').bind(id,user.userId).first<IdeaRow>();
  return Response.json({ idea: publicIdea(row!) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const { id, status } = await request.json() as { id?: string; status?: string };
  const allowed = ['待整理','待验证','计划中','行动中','已完成','已搁置','已归档'];
  if (!id || !status || !allowed.includes(status)) return Response.json({ error: '无效请求' }, { status: 400 });
  await ensureIdeasTable();
  await env.DB.prepare('UPDATE ideas SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(status,Date.now(),id,user.userId).run();
  return Response.json({ ok: true });
}
