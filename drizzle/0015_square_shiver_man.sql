ALTER TABLE `bookings` ADD `request_fingerprint` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `calendar_sequence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_jobs` ADD `delivery_key` text;