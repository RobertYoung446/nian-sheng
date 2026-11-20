import { getChatGPTUser } from '../../chatgpt-auth';
import { readWorkspace } from '../../../db/workspace';
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const snapshot = await readWorkspace(user.userId);
  return Response.json({ ideas: snapshot.workspace.ideas, actions: snapshot.workspace.actions }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST() { return Response.json({ error: '念生已升级，请刷新页面后继续；原输入请先复制保留', code: 'UPGRADE_REQUIRED' }, { status: 409 }); }
export const PATCH = POST;
