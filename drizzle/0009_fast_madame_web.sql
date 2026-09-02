ALTER TABLE `bookings` ADD `google_connection_id` text;--> statement-breakpoint
CREATE INDEX `bookings_google_connection_idx` ON `bookings` (`google_connection_id`,`starts_at`);--> statement-breakpoint
ALTER TABLE `google_calendar_connections` ADD `connection_id` text;--> statement-breakpoint
UPDATE `google_calendar_connections`
SET `connection_id` = 'legacy-' || `employee_id` || '-' || lower(hex(randomblob(16)))
WHERE `connection_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_connections_id_unique` ON `google_calendar_connections` (`connection_id`);--> statement-breakpoint
UPDATE `google_calendar_connections`
SET `google_account_email` = lower(trim(`google_account_email`));--> statement-breakpoint
WITH `ranked_connections` AS (
	SELECT connection.*,
		row_number() OVER (
			PARTITION BY lower(connection.`google_account_email`)
			ORDER BY CASE WHEN EXISTS (
				SELECT 1 FROM `salon_users` salon_user
				WHERE salon_user.`active` = 1
					AND salon_user.`employee_id` = connection.`employee_id`
					AND salon_user.`role` IN ('owner','admin')
			) THEN 0 ELSE 1 END,
			connection.`updated_at` DESC,
			connection.`employee_id`
		) AS `connection_rank`
	FROM `google_calendar_connections` connection
)
INSERT OR IGNORE INTO `google_calendar_cleanup_connections` (
	`id`,`employee_id`,`calendar_id`,`google_account_email`,`refresh_token_encrypted`,
	`connected_by_email`,`connected_at`,`source_updated_at`,`retired_at`,`retired_by_email`,`reason`
)
SELECT `connection_id`,`employee_id`,`calendar_id`,`google_account_email`,`refresh_token_encrypted`,
	`connected_by_email`,`connected_at`,`updated_at`,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration','calendar_replaced'
FROM `ranked_connections`
WHERE `connection_rank` > 1;--> statement-breakpoint
WITH `ranked_connections` AS (
	SELECT connection.`employee_id`, connection.`connection_id`, connection.`refresh_token_encrypted`,
		row_number() OVER (
			PARTITION BY lower(connection.`google_account_email`)
			ORDER BY CASE WHEN EXISTS (
				SELECT 1 FROM `salon_users` salon_user
				WHERE salon_user.`active` = 1
					AND salon_user.`employee_id` = connection.`employee_id`
					AND salon_user.`role` IN ('owner','admin')
			) THEN 0 ELSE 1 END,
			connection.`updated_at` DESC,
			connection.`employee_id`
		) AS `connection_rank`
	FROM `google_calendar_connections` connection
)
DELETE FROM `google_calendar_connections`
WHERE `employee_id` IN (
	SELECT ranked.`employee_id`
	FROM `ranked_connections` ranked
	WHERE ranked.`connection_rank` > 1
		AND EXISTS (
			SELECT 1 FROM `google_calendar_cleanup_connections` cleanup
			WHERE cleanup.`id` = ranked.`connection_id`
				AND cleanup.`refresh_token_encrypted` = ranked.`refresh_token_encrypted`
		)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `google_calendar_connections_account_unique` ON `google_calendar_connections` (`google_account_email`);
