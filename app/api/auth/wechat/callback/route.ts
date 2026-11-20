import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { ensureAuthTables, type OAuthStateRow } from '../../../../../db/auth';
import {
  createAccountSession,
  clearedOAuthStateCookieHeader,
  hashValue,
  OAUTH_STATE_COOKIE,
  sessionCookieHeader,
} from '../../../../account-auth';

type WeChatToken = {
  access_token: string;
  openid: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

type WeChatProfile = {
  nickname?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isWeChatToken(value: unknown): value is WeChatToken {
  return isRecord(value) && typeof value.access_token === 'string' && typeof value.openid === 'string';
}

function asWeChatProfile(value: unknown): WeChatProfile {
  if (!isRecord(value)) return {};
  return {
    nickname: typeof value.nickname === 'string' ? value.nickname : undefined,
    unionid: typeof value.unionid === 'string' ? value.unionid : undefined,
    errcode: typeof value.errcode === 'number' ? value.errcode : undefined,
    errmsg: typeof value.errmsg === 'string' ? value.errmsg : undefined,
  };
}

function authError(requestUrl: string, code: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(`/auth?error=${encodeURIComponent(code)}`, requestUrl).toString(),
      'Set-Cookie': clearedOAuthStateCookieHeader(requestUrl),
    },
  });
}

export async function GET(request: Request) {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) return authError(request.url, 'wechat_not_configured');
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const browserState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || code.length > 256 || !state || !/^[a-f0-9]{64}$/.test(state) || !browserState) {
    return authError(request.url, 'wechat_invalid_callback');
  }
  await ensureAuthTables();
  const stateHash = await hashValue(state);
  const browserStateHash = await hashValue(browserState);
  const oauthState = await env.DB.prepare(`SELECT * FROM oauth_states
    WHERE state_hash=? AND state_hash=? AND provider='wechat' LIMIT 1`)
    .bind(stateHash, browserStateHash)
    .first<OAuthStateRow>();
  await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=?').bind(stateHash).run();
  if (!oauthState || oauthState.expires_at <= Date.now()) return authError(request.url, 'wechat_state_expired');

  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.searchParams.set('appid', env.WECHAT_APP_ID);
  tokenUrl.searchParams.set('secret', env.WECHAT_APP_SECRET);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  const tokenResponse = await fetch(tokenUrl, { headers: { Accept: 'application/json' } });
  const tokenData: unknown = await tokenResponse.json();
  if (!tokenResponse.ok || !isWeChatToken(tokenData)) return authError(request.url, 'wechat_exchange_failed');

  const profileUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  profileUrl.searchParams.set('access_token', tokenData.access_token);
  profileUrl.searchParams.set('openid', tokenData.openid);
  profileUrl.searchParams.set('lang', 'zh_CN');
  const profileResponse = await fetch(profileUrl, { headers: { Accept: 'application/json' } });
  const profile = profileResponse.ok ? asWeChatProfile(await profileResponse.json()) : {};
  const unionId = profile.unionid || tokenData.unionid;
  const providerUserId = unionId ? `union:${unionId}` : `openid:${env.WECHAT_APP_ID}:${tokenData.openid}`;
  const identity = await env.DB.prepare(`SELECT user_id FROM auth_identities
    WHERE provider='wechat' AND provider_user_id=? LIMIT 1`)
    .bind(providerUserId)
    .first<{ user_id: string }>();
  if (oauthState.link_user_id && identity && identity.user_id !== oauthState.link_user_id) {
    return authError(request.url, 'wechat_linked_elsewhere');
  }

  const now = Date.now();
  const userId = identity?.user_id || oauthState.link_user_id || `user_${crypto.randomUUID()}`;
  if (!identity) {
    if (!oauthState.link_user_id) {
      const displayName = profile.nickname?.trim().slice(0, 40) || '微信用户';
      await env.DB.prepare(`INSERT INTO users
        (id,email,display_name,email_verified,created_at,updated_at) VALUES (?,NULL,?,0,?,?)`)
        .bind(userId, displayName, now, now)
        .run();
    }
    await env.DB.prepare(`INSERT INTO auth_identities
      (id,user_id,provider,provider_user_id,email,created_at,updated_at)
      VALUES (?,?,'wechat',?,NULL,?,?)`)
      .bind(crypto.randomUUID(), userId, providerUserId, now, now)
      .run();
  }
  const token = await createAccountSession(userId, 'wechat');
  const responseHeaders = new Headers({ Location: new URL(oauthState.return_to, url.origin).toString() });
  responseHeaders.append('Set-Cookie', sessionCookieHeader(token, request.url));
  responseHeaders.append('Set-Cookie', clearedOAuthStateCookieHeader(request.url));
  return new Response(null, {
    status: 302,
    headers: responseHeaders,
  });
}
