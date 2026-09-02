CREATE TABLE `google_calendar_cleanup_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`google_account_email` text NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`connected_by_email` text NOT NULL,
	`connected_at` text NOT NULL,
	`source_updated_at` text NOT NULL,
	`retired_at` text NOT NULL,
	`retired_by_email` text NOT NULL,
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_cleanup_token_unique` ON `google_calendar_cleanup_connections` (`refresh_token_encrypted`);--> statement-breakpoint
CREATE INDEX `google_calendar_cleanup_employee_idx` ON `google_calendar_cleanup_connections` (`employee_id`,`retired_at`);--> statement-breakpoint
CREATE INDEX `google_calendar_cleanup_account_idx` ON `google_calendar_cleanup_connections` (`google_account_email`);