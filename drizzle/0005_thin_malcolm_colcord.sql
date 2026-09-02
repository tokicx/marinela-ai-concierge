CREATE TABLE `request_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`window_start` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `request_rate_limits_expiry_idx` ON `request_rate_limits` (`expires_at`);