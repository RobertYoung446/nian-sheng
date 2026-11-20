CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`idea_id` text NOT NULL,
	`description` text NOT NULL,
	`done_definition` text NOT NULL,
	`estimate_minutes` integer,
	`status` text DEFAULT 'todo' NOT NULL,
	`outcome` text,
	`learning` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_actions_user_updated` ON `actions` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_actions_user_idea` ON `actions` (`user_id`,`idea_id`);--> statement-breakpoint
CREATE INDEX `idx_actions_user_status` ON `actions` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'inactive' NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`current_period_end` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_customer` ON `subscriptions` (`stripe_customer_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_subscription` ON `subscriptions` (`stripe_subscription_id`);