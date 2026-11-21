import { deleteAccountSession } from '../../../account-auth';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ code: 'AUTH', message: '登录已失效，请刷新后重新登录' }, { status: 401 });
  const expected = request.headers.get('X-Niansheng-Account');
  if (!expected) return Response.json({ code: 'UPGRADE_REQUIRED', message: '念生已升级，请刷新页面后再退出' }, { status: 428 });
  if (expected !== encodeURIComponent(user.userId)) return Response.json({ code: 'ACCOUNT_CHANGED', message: '登录账户已切换，未退出当前账户；请刷新后检查' }, { status: 401 });
  await deleteAccountSession();
  // The server-side session is revoked. A delayed Set-Cookie deletion could
  // otherwise erase a different account's newer session in another tab.
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
