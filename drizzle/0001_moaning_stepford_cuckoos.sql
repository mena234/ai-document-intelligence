CREATE TABLE `uploaded_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`digest` text NOT NULL,
	`filename` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`state` text NOT NULL,
	`content` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_owner_digest` ON `uploaded_documents` (`owner`,`digest`);--> statement-breakpoint
CREATE INDEX `upload_expiry` ON `uploaded_documents` (`expires_at`);