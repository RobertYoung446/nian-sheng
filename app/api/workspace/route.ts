import { getChatGPTUser } from '../../chatgpt-auth';
import { readJsonRecord } from '../../account-auth';
import { readWorkspace, writeOperation } from '../../../db/workspace';
import { WorkspaceError, type Operation } from '../../../lib/workspace';

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({ code: 'AUTH', message: '请重新登录；本机记录与待同步操作会保留' }, 401);
  try { return json(await readWorkspace(user.userId)); }
  catch { return json({ code: 'STORAGE', message: '暂时无法读取云端空间，请稍后重试' }, 503); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ code: 'AUTH', message: '请重新登录；本机记录与待同步操作会保留' }, 401);
  const value = await readJsonRecord(request, 1_600_000);
  if (!value || !value.operation || typeof value.operation !== 'object') return json({ code: 'INVALID', message: '操作格式无效' }, 400);
  try { return json(await writeOperation(user.userId, value.operation as Operation)); }
  catch (error) {
    if (error instanceof WorkspaceError) {
      return json({ code: error.code, message: error.message, ...(error.code === 'CONFLICT' ? { snapshot: await readWorkspace(user.userId) } : {}) }, error.code === 'CONFLICT' ? 409 : error.code === 'BUSY' ? 503 : 400);
    }
    const requestId = crypto.randomUUID();
    console.error('Workspace storage error', { requestId, name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : 'unknown' });
    return json({ code: 'STORAGE', message: '云端保存失败，本机操作已保留，可重试同步', requestId }, 503);
  }
}
