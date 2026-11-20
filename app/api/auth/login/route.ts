import { env } from 'cloudflare:workers';
import { ensureAuthTables, type UserRow } from '../../../../db/auth';
import {
  createAccountSession,
  createPasswordRecord,
  normalizeEmail,
  readJsonRecord,
  sessionCookieHeader,
  verifyPassword,
} from '../../../account-auth';

type AttemptRow = { attempt_count: number; blocked_until: number | null };

export async function POST(request: Request) {
  const input = await readJsonRecord(request);
  if (!input) return Response.json({ error: '请求格式无效' }, { status: 400 });
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!email || !password || email.length > 254 || password.length > 128) {
    return Response.json({ error: '邮箱或密码错误' }, { status: 401 });
  }
  await ensureAuthTables();
  const now = Date.now();
  const attempts = await env.DB.prepare('SELECT attempt_count,blocked_until FROM auth_attempts WHERE identity_key=?')
    .bind(email)
    .first<AttemptRow>();
  if (attempts?.blocked_until && attempts.blocked_until > now) {
    return Response.json({ error: '尝试次数过多，请 15 分钟后再试' }, { status: 429 });
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<UserRow>();
  const valid = user ? await verifyPassword(password, user) : (await createPasswordRecord(password), false);
  if (!user || !valid) {
    const count = (attempts?.attempt_count || 0) + 1;
    const blockedUntil = count >= 5 ? now + 15 * 60 * 1000 : null;
    await env.DB.prepare(`INSERT INTO auth_attempts(identity_key,attempt_count,blocked_until,updated_at)
      VALUES (?,?,?,?) ON CONFLICT(identity_key) DO UPDATE SET
      attempt_count=excluded.attempt_count,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at`)
      .bind(email, count >= 5 ? 0 : count, blockedUntil, now)
      .run();
    return Response.json({ error: '邮箱或密码错误' }, { status: 401 });
  }
  await env.DB.prepare('DELETE FROM auth_attempts WHERE identity_key=?').bind(email).run();
  const token = await createAccountSession(user.id, 'email');
  return Response.json(
    { user: { userId: user.id, displayName: user.display_name, email: user.email, authProvider: 'email' } },
    { headers: { 'Set-Cookie': sessionCookieHeader(token, request.url) } },
  );
}
