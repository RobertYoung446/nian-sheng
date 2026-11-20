CREATE TABLE `auth_attempts` (
	`identity_key` text PRIMARY KEY NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_identity_provider_user` ON `auth_identities` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE INDEX `idx_auth_identity_user` ON `auth_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`return_to` text NOT NULL,
	`link_user_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_states_expiry` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`auth_provider` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_sessions_token` ON `user_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_user_sessions_user` ON `user_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_sessions_expiry` ON `user_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`password_hash` text,
	`password_salt` text,
	`password_iterations` integer,
	`display_name` text NOT NULL,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);