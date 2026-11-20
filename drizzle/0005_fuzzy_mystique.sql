CREATE TABLE `workspace_documents` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`last_operation` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_receipts_user` ON `workspace_receipts` (`user_id`);