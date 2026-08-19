CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`encrypted_size` integer NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`download_limit` integer NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`delete_token_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT "transfers_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE INDEX `transfers_expiry_idx` ON `transfers` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `transfers_status_idx` ON `transfers` (`status`);

