// The session authorizes the action; this only detects a stale account page.
export function requireExpectedAccount(request: Request, userId: string): Response | null {
  const expected = request.headers.get('X-Niansheng-Account');
  if (!expected) return Response.json({ code: 'UPGRADE_REQUIRED', message: '念生已升级，请刷新页面后重试' }, { status: 428 });
  if (expected !== encodeURIComponent(userId)) return Response.json({ code: 'ACCOUNT_CHANGED', message: '登录账户已切换，请刷新后检查当前账户' }, { status: 401 });
  return null;
}
