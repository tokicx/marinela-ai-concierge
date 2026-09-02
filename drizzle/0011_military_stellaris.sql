DROP INDEX `salon_users_employee_idx`;--> statement-breakpoint
UPDATE `salon_users` SET `employee_id` = NULL WHERE `active` = 0;--> statement-breakpoint
WITH `ranked_assignments` AS (
	SELECT `id`, row_number() OVER (
		PARTITION BY `employee_id`
		ORDER BY CASE `role`
			WHEN 'owner' THEN 0
			WHEN 'admin' THEN 1
			ELSE 2
		END, `created_at`, `id`
	) AS `assignment_rank`
	FROM `salon_users`
	WHERE `active` = 1 AND `employee_id` IS NOT NULL
)
UPDATE `salon_users`
SET `active` = 0,
	`employee_id` = NULL,
	`removed_at` = COALESCE(`removed_at`, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	`updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `id` IN (
	SELECT `id` FROM `ranked_assignments` WHERE `assignment_rank` > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `salon_users_employee_unique` ON `salon_users` (`employee_id`);
