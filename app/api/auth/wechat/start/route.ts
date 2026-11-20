import { env } from 'cloudflare:workers';
import { ensureAuthTables } from '../../../../../db/auth';
import { hashValue, oauthStateCookieHeader, randomHex, safeReturnTo } from '../../../../account-auth';
import { getChatGPTUser } from '../../../../chatgpt-auth';

export async function GET(request: Request) {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) {
    return Response.redirect(new URL('/auth?error=wechat_not_configured', request.url), 302);
  }
  await ensureAuthTables();
  const currentUser = await getChatGPTUser();
  const now = Date.now();
  if (currentUser) {
    await env.DB.prepare(`INSERT INTO users
      (id,email,display_name,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,updated_at=excluded.updated_at`)
      .bind(currentUser.userId, currentUser.email || null, currentUser.displayName, currentUser.email ? 1 : 0, now, now)
      .run();
  }
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get('return_to'));
  const state = randomHex();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<=?').bind(now),
    env.DB.prepare(`INSERT INTO oauth_states
      (state_hash,provider,return_to,link_user_id,expires_at,created_at) VALUES (?, 'wechat', ?,?,?,?)`)
      .bind(await hashValue(state), returnTo, currentUser?.userId || null, now + 10 * 60 * 1000, now),
  ]);
  const callback = `${url.origin}/api/auth/wechat/callback`;
  const authorization = new URL('https://open.weixin.qq.com/connect/qrconnect');
  authorization.searchParams.set('appid', env.WECHAT_APP_ID);
  authorization.searchParams.set('redirect_uri', callback);
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('scope', 'snsapi_login');
  authorization.searchParams.set('state', state);
  authorization.hash = 'wechat_redirect';
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorization.toString(),
      'Set-Cookie': oauthStateCookieHeader(state, request.url),
    },
  });
}
