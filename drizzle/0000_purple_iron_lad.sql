CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`service_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`date_local` text NOT NULL,
	`start_time_local` text NOT NULL,
	`end_time_local` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`note` text,
	`google_event_id` text,
	`google_etag` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_idempotency_key_unique` ON `bookings` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `bookings_employee_time_idx` ON `bookings` (`employee_id`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE TABLE `employee_services` (
	`employee_id` text NOT NULL,
	`service_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`employee_id`, `service_id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`calendar_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`type` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_job_unique` ON `notification_jobs` (`booking_id`,`type`,`due_at`);--> statement-breakpoint
CREATE INDEX `notification_jobs_due_idx` ON `notification_jobs` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `schedule_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedule_exceptions_employee_idx` ON `schedule_exceptions` (`employee_id`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `service_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`buffer_minutes` integer DEFAULT 0 NOT NULL,
	`price_label` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slot_claims` (
	`employee_id` text NOT NULL,
	`slot_key` text NOT NULL,
	`booking_id` text NOT NULL,
	`expires_at` text,
	PRIMARY KEY(`employee_id`, `slot_key`)
);
--> statement-breakpoint
CREATE INDEX `slot_claims_booking_idx` ON `slot_claims` (`booking_id`);