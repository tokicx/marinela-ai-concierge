DROP INDEX `bookings_employee_time_idx`;--> statement-breakpoint
ALTER TABLE `bookings` ADD `blocked_until` text;--> statement-breakpoint
CREATE INDEX `bookings_employee_time_idx` ON `bookings` (`employee_id`,`starts_at`,`blocked_until`);