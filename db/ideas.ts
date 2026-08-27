import { env } from 'cloudflare:workers';

export type IdeaRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  summary: string;
  tags: string;
  status: string;
  feasibility: number;
  impact: number;
  clarity: number;
  confidence: number;
  risk: string;
  next_action: string;
  created_at: number;
  updated_at: number;
};

let ready = false;

export async function ensureIdeasTable() {
  if (ready) return;
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT '待整理',
      feasibility INTEGER NOT NULL DEFAULT 50,
      impact INTEGER NOT NULL DEFAULT 50,
      clarity INTEGER NOT NULL DEFAULT 50,
      confidence INTEGER NOT NULL DEFAULT 50,
      risk TEXT NOT NULL,
      next_action TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ideas_user_updated ON ideas(user_id, updated_at DESC)'),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ideas_user_active ON ideas(user_id, status) WHERE status != '已归档'"),
  ]);
  ready = true;
}

export function analyzeIdea(content: string) {
  const clean = content.replace(/\s+/g, ' ').trim();
  const title = clean.length > 32 ? `${clean.slice(0, 30)}…` : clean;
  const hasAudience = /(用户|人群|创作者|学生|团队|企业|孩子|老人|客户|消费者)/.test(clean);
  const hasAction = /(制作|开发|建立|设计|帮助|解决|提供|连接|记录|验证|实现)/.test(clean);
  const hasOutcome = /(提高|减少|更快|更好|价值|收入|效率|体验|成长|落地)/.test(clean);
  const hasSpecifics = /(每天|每周|分钟|小时|个月|个|三|一|首先|然后|通过)/.test(clean);
  const lengthBonus = Math.min(18, Math.floor(clean.length / 8));
  const clarity = Math.min(92, 38 + lengthBonus + (hasAudience ? 14 : 0) + (hasAction ? 12 : 0));
  const feasibility = Math.min(90, 50 + (hasAction ? 12 : 0) + (hasSpecifics ? 10 : 0) - (clean.length < 18 ? 12 : 0));
  const impact = Math.min(92, 48 + (hasOutcome ? 18 : 0) + (hasAudience ? 10 : 0));
  const confidence = Math.round((clarity + feasibility + impact) / 3) - 6;
  const tags = [
    /(产品|工具|软件|网站|应用|平台)/.test(clean) ? '产品' : null,
    /(内容|写作|视频|播客|声音|创作)/.test(clean) ? '内容' : null,
    /(学习|知识|课程|教育)/.test(clean) ? '学习' : null,
    /(商业|收入|客户|市场|销售)/.test(clean) ? '商业' : null,
    /(习惯|每天|每周|生活|健康)/.test(clean) ? '生活' : null,
  ].filter(Boolean) as string[];
  if (!tags.length) tags.push('新想法');
  const missing = !hasAudience ? '目标用户仍不够明确' : !hasOutcome ? '预期价值还缺少可衡量的结果' : '用户是否愿意改变现有行为尚未验证';
  const nextAction = !hasAudience
    ? '写出最可能需要它的一类人，并找 1 位真实对象聊 15 分钟。'
    : !hasOutcome
      ? '定义一个可以在 7 天内观察到的成功指标。'
      : '找 3 位目标用户，用同一个问题验证他们是否真的存在这项需求。';
  return {
    title,
    summary: `这个想法试图${hasAction ? '通过一个具体方案' : '探索一种新方式'}解决问题。当前最值得补充的是：${missing}。`,
    tags,
    feasibility,
    impact,
    clarity,
    confidence: Math.max(35, confidence),
    risk: `${missing}。如果这一假设不成立，继续投入可能只会增加沉没成本。`,
    nextAction,
  };
}
