import { env } from 'cloudflare:workers';

export type ActionRow = {
  id: string;
  user_id: string;
  idea_id: string;
  description: string;
  done_definition: string;
  estimate_minutes: number | null;
  status: string;
  outcome: string | null;
  learning: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
};

export async function ensureActionsTable() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      idea_id TEXT NOT NULL,
      description TEXT NOT NULL,
      done_definition TEXT NOT NULL,
      estimate_minutes INTEGER,
      status TEXT NOT NULL DEFAULT 'todo',
      outcome TEXT,
      learning TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_actions_user_updated ON actions(user_id, updated_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_actions_user_idea ON actions(user_id, idea_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_actions_user_status ON actions(user_id, status)'),
  ]);
}

export function publicAction(row: ActionRow) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    description: row.description,
    doneDefinition: row.done_definition,
    estimateMinutes: row.estimate_minutes,
    status: row.status,
    outcome: row.outcome,
    learning: row.learning,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}
