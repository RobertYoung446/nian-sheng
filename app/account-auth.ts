import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { ensureAuthTables, type SessionUserRow, type UserRow } from '../db/auth';

export type AccountUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  authProvider: 'email' | 'wechat';
};

export const SESSION_COOKIE = 'niansheng_session';
export const OAUTH_STATE_COOKIE = 'niansheng_oauth_state';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
// Cloudflare Workers currently rejects PBKDF2 iteration counts above 100,000.
// Persist the count with every user so the format can be upgraded later.
export const PASSWORD_ITERATIONS = 100_000;
const MAX_SUPPORTED_PASSWORD_ITERATIONS = 100_000;

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function randomHex(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashValue(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function createPasswordRecord(password: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    hash: bytesToBase64Url(hash),
    salt: bytesToBase64Url(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password: string, user: UserRow) {
  if (!user.password_hash || !user.password_salt || !user.password_iterations) return false;
  if (user.password_iterations < 1 || user.password_iterations > MAX_SUPPORTED_PASSWORD_ITERATIONS) return false;
  const expected = base64UrlToBytes(user.password_hash);
  const actual = await derivePassword(password, base64UrlToBytes(user.password_salt), user.password_iterations);
  if (expected.byteLength !== actual.byteLength) return false;
  return timingSafeEqual(expected, actual);
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://app.local');
    if (url.origin !== 'https://app.local' || url.pathname.startsWith('/api/auth/')) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export async function readJsonRecord(request: Request, maxBytes = 8192) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) return null;
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return null;
  const text = await request.text();
  if (encoder.encode(text).byteLength > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function createAccountSession(userId: string, authProvider: 'email' | 'wechat') {
  await ensureAuthTables();
  const token = randomToken();
  const tokenHash = await hashValue(token);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare(`INSERT INTO user_sessions
      (id,user_id,token_hash,auth_provider,expires_at,created_at) VALUES (?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, tokenHash, authProvider, now + SESSION_TTL_SECONDS * 1000, now),
  ]);
  return token;
}

export function sessionCookieHeader(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearedSessionCookieHeader(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function oauthStateCookieHeader(state: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';
  return `${OAUTH_STATE_COOKIE}=${state}; Path=/api/auth/wechat/callback; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

export function clearedOAuthStateCookieHeader(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';
  return `${OAUTH_STATE_COOKIE}=; Path=/api/auth/wechat/callback; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function getAccountUser(): Promise<AccountUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureAuthTables();
  const tokenHash = await hashValue(token);
  const row = await env.DB.prepare(`SELECT u.*, s.auth_provider, s.expires_at
    FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? LIMIT 1`)
    .bind(tokenHash)
    .first<SessionUserRow>();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash=?').bind(tokenHash).run();
    return null;
  }
  if (row.auth_provider !== 'email' && row.auth_provider !== 'wechat') return null;
  return {
    userId: row.id,
    displayName: row.display_name,
    email: row.email || '',
    fullName: row.display_name,
    authProvider: row.auth_provider,
  };
}

export async function deleteAccountSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await ensureAuthTables();
  await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash=?')
    .bind(await hashValue(token))
    .run();
}
