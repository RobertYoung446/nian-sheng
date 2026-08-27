CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`summary` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT '待整理' NOT NULL,
	`feasibility` integer DEFAULT 50 NOT NULL,
	`impact` integer DEFAULT 50 NOT NULL,
	`clarity` integer DEFAULT 50 NOT NULL,
	`confidence` integer DEFAULT 50 NOT NULL,
	`risk` text DEFAULT '需要进一步确认目标用户与真实需求。' NOT NULL,
	`next_action` text DEFAULT '写下这个想法最需要验证的一个假设。' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
