CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code_digest` text NOT NULL,
	`sender_token_digest` text NOT NULL,
	`receiver_token_digest` text,
	`sender_seen_at` integer NOT NULL,
	`receiver_seen_at` integer,
	`sender_public_key` text,
	`receiver_public_key` text,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_digest_unique` ON `rooms` (`code_digest`);--> statement-breakpoint
CREATE INDEX `rooms_expiry_idx` ON `rooms` (`expires_at`);--> statement-breakpoint
CREATE TABLE `room_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`sender_role` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `room_signals_room_idx` ON `room_signals` (`room_id`,`id`);
