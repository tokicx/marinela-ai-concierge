ALTER TABLE `notification_jobs` ADD `provider_account_key` text;--> statement-breakpoint
ALTER TABLE `notification_jobs` ADD `provider_generation` integer DEFAULT 0 NOT NULL;