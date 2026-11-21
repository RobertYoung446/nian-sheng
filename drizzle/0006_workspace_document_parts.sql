CREATE TABLE `workspace_document_parts` (
	`user_id` text NOT NULL,
	`position` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`user_id`, `position`),
	FOREIGN KEY (`user_id`) REFERENCES `workspace_documents`(`user_id`) ON UPDATE no action ON DELETE cascade
);
