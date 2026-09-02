CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`details` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_log_created_idx` ON `admin_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `calendar_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`user_email` text NOT NULL,
	`code_verifier` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calendar_oauth_states_expiry_idx` ON `calendar_oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `google_calendar_connections` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`google_account_email` text NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`connected_by_email` text NOT NULL,
	`connected_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `salon_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`employee_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`removed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salon_users_email_unique` ON `salon_users` (`email`);--> statement-breakpoint
CREATE INDEX `salon_users_employee_idx` ON `salon_users` (`employee_id`,`active`);--> statement-breakpoint
INSERT OR IGNORE INTO `salon_users` (`id`,`email`,`display_name`,`role`,`employee_id`,`active`,`created_by_email`,`created_at`,`updated_at`,`removed_at`) VALUES ('site-owner-ivan','owner@example.com','Ivan Tokić','owner',NULL,1,'system','2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z',NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `salon_users` (`id`,`email`,`display_name`,`role`,`employee_id`,`active`,`created_by_email`,`created_at`,`updated_at`,`removed_at`) VALUES ('salon-admin-marinela','salon@example.com','Marinela Grančić','admin','marinela',1,'owner@example.com','2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z',NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `salon_users` (`id`,`email`,`display_name`,`role`,`employee_id`,`active`,`created_by_email`,`created_at`,`updated_at`,`removed_at`) VALUES ('salon-staff-mia','former.staff@example.com','Mia Jakelić','staff','mia',1,'salon@example.com','2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z',NULL);
