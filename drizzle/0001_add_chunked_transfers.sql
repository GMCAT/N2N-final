ALTER TABLE `transfers` ADD `format_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `transfers` ADD `file_id` text;
--> statement-breakpoint
ALTER TABLE `transfers` ADD `part_count` integer DEFAULT 1 NOT NULL;
