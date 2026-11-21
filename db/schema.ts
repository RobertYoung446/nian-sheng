import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspaceDocuments = sqliteTable('workspace_documents', {
  userId: text('user_id').primaryKey(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
  lastOperation: text('last_operation').notNull().default(''),
});

export const workspaceDocumentParts = sqliteTable('workspace_document_parts', {
  userId: text('user_id').notNull().references(() => workspaceDocuments.userId, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  payload: text('payload').notNull(),
}, table => [primaryKey({ columns: [table.userId, table.position] })]);

export const workspaceReceipts = sqliteTable('workspace_receipts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('idx_workspace_receipts_user').on(table.userId)]);

export const ideas = sqliteTable('ideas', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  summary: text('summary').notNull(),
  tags: text('tags').notNull().default('[]'),
  status: text('status').notNull().default('待整理'),
  feasibility: integer('feasibility').notNull().default(50),
  impact: integer('impact').notNull().default(50),
  clarity: integer('clarity').notNull().default(50),
  confidence: integer('confidence').notNull().default(50),
  risk: text('risk').notNull().default('需要进一步确认目标用户与真实需求。'),
  nextAction: text('next_action').notNull().default('写下这个想法最需要验证的一个假设。'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_ideas_user_updated').on(table.userId, table.updatedAt),
  index('idx_ideas_user_status').on(table.userId, table.status),
]);

export const actions = sqliteTable('actions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  ideaId: text('idea_id').notNull(),
  description: text('description').notNull(),
  doneDefinition: text('done_definition').notNull(),
  estimateMinutes: integer('estimate_minutes'),
  status: text('status').notNull().default('todo'),
  outcome: text('outcome'),
  learning: text('learning'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
}, (table) => [
  index('idx_actions_user_updated').on(table.userId, table.updatedAt),
  index('idx_actions_user_idea').on(table.userId, table.ideaId),
  index('idx_actions_user_status').on(table.userId, table.status),
  uniqueIndex('idx_actions_one_active_per_idea')
    .on(table.userId, table.ideaId)
    .where(sql`${table.status} IN ('todo', 'doing')`),
]);

export const subscriptions = sqliteTable('subscriptions', {
  userId: text('user_id').primaryKey(),
  plan: text('plan').notNull().default('free'),
  status: text('status').notNull().default('inactive'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  currentPeriodEnd: integer('current_period_end'),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_subscriptions_customer').on(table.stripeCustomerId),
  index('idx_subscriptions_subscription').on(table.stripeSubscriptionId),
]);

export const billingEvents = sqliteTable('billing_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  receivedAt: integer('received_at').notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  passwordHash: text('password_hash'),
  passwordSalt: text('password_salt'),
  passwordIterations: integer('password_iterations'),
  displayName: text('display_name').notNull(),
  emailVerified: integer('email_verified').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_users_email').on(table.email),
]);

export const authIdentities = sqliteTable('auth_identities', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  email: text('email'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_auth_identity_provider_user').on(table.provider, table.providerUserId),
  index('idx_auth_identity_user').on(table.userId),
]);

export const userSessions = sqliteTable('user_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  authProvider: text('auth_provider').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_user_sessions_token').on(table.tokenHash),
  index('idx_user_sessions_user').on(table.userId),
  index('idx_user_sessions_expiry').on(table.expiresAt),
]);

export const oauthStates = sqliteTable('oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  provider: text('provider').notNull(),
  returnTo: text('return_to').notNull(),
  linkUserId: text('link_user_id'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_oauth_states_expiry').on(table.expiresAt),
]);

export const authAttempts = sqliteTable('auth_attempts', {
  identityKey: text('identity_key').primaryKey(),
  attemptCount: integer('attempt_count').notNull().default(0),
  blockedUntil: integer('blocked_until'),
  updatedAt: integer('updated_at').notNull(),
});
