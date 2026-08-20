CREATE TABLE `room_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`token_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_queue_order_idx` ON `room_queue` (`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `room_queue_expiry_idx` ON `room_queue` (`expires_at`);
