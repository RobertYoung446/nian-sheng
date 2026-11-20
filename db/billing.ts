import { env } from 'cloudflare:workers';

export type SubscriptionRow = {
  user_id: string;
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: number | null;
  updated_at: number;
};

export async function ensureBillingTables() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'inactive',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_end INTEGER,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(stripe_customer_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_subscriptions_subscription ON subscriptions(stripe_subscription_id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS billing_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      received_at INTEGER NOT NULL
    )`),
  ]);
}

export async function subscriptionForUser(userId: string) {
  await ensureBillingTables();
  return env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?')
    .bind(userId)
    .first<SubscriptionRow>();
}

export function publicSubscription(row: SubscriptionRow | null) {
  return {
    plan: row?.plan || 'free',
    status: row?.status || 'inactive',
    currentPeriodEnd: row?.current_period_end || null,
    canManage: Boolean(row?.stripe_customer_id),
  };
}
