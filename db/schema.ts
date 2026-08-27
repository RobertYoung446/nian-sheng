import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
