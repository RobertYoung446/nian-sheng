CREATE INDEX `idx_ideas_user_updated` ON `ideas` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_ideas_user_status` ON `ideas` (`user_id`,`status`);