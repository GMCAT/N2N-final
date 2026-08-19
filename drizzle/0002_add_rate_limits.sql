CREATE TABLE `rate_limits` (
	`rate_key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_window_idx` ON `rate_limits` (`window_start`);

