import { env } from 'cloudflare:workers';
import { ensureAuthTables } from '../../../../db/auth';
import {
  createAccountSession,
  createPasswordRecord,
  normalizeEmail,
  readJsonRecord,
  sessionCookieHeader,
} from '../../../account-auth';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const input = await readJsonRecord(request);
  if (!input) return Response.json({ error: '请求格式无效' }, { status: 400 });
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim().slice(0, 40) : '';
  if (!emailPattern.test(email) || email.length > 254) {
    return Response.json({ error: '请输入有效的邮箱地址' }, { status: 400 });
  }
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return Response.json({ error: '密码需为 10–128 位，并同时包含字母和数字' }, { status: 400 });
  }
  if (displayName.length < 2) {
    return Response.json({ error: '称呼至少需要 2 个字符' }, { status: 400 });
  }
  await ensureAuthTables();
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first<{ id: string }>();
  if (existing) return Response.json({ error: '该邮箱已经注册，请直接登录' }, { status: 409 });

  const passwordRecord = await createPasswordRecord(password);
  const userId = `user_${crypto.randomUUID()}`;
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users
        (id,email,password_hash,password_salt,password_iterations,display_name,email_verified,created_at,updated_at)
        VALUES (?,?,?,?,?,?,0,?,?)`)
        .bind(userId, email, passwordRecord.hash, passwordRecord.salt, passwordRecord.iterations, displayName, now, now),
      env.DB.prepare(`INSERT INTO auth_identities
        (id,user_id,provider,provider_user_id,email,created_at,updated_at) VALUES (?,?, 'email', ?,?,?,?)`)
        .bind(crypto.randomUUID(), userId, email, email, now, now),
    ]);
  } catch {
    return Response.json({ error: '该邮箱已经注册，请直接登录' }, { status: 409 });
  }
  const token = await createAccountSession(userId, 'email');
  return Response.json(
    { user: { userId, displayName, email, authProvider: 'email' } },
    { status: 201, headers: { 'Set-Cookie': sessionCookieHeader(token, request.url) } },
  );
}
