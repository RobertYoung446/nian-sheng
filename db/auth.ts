import { env } from 'cloudflare:workers';

export type UserRow = {
  id: string;
  email: string | null;
  password_hash: string | null;
  password_salt: string | null;
  password_iterations: number | null;
  display_name: string;
  email_verified: number;
  created_at: number;
  updated_at: number;
};

export type SessionUserRow = UserRow & {
  auth_provider: string;
  expires_at: number;
};

export type OAuthStateRow = {
  state_hash: string;
  provider: string;
  return_to: string;
  link_user_id: string | null;
  expires_at: number;
  created_at: number;
};

export async function ensureAuthTables() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      password_hash TEXT,
      password_salt TEXT,
      password_iterations INTEGER,
      display_name TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identity_provider_user ON auth_identities(provider, provider_user_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_auth_identity_user ON auth_identities(user_id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      auth_provider TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      return_to TEXT NOT NULL,
      link_user_id TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_attempts (
      identity_key TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER,
      updated_at INTEGER NOT NULL
    )`),
  ]);
}
