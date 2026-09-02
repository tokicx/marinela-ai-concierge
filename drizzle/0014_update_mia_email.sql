CREATE TABLE IF NOT EXISTS `_migration_0014_mia_login_guard` (
	`ok` integer NOT NULL CHECK (`ok` = 1)
);
--> statement-breakpoint
DELETE FROM `_migration_0014_mia_login_guard`;
--> statement-breakpoint
INSERT INTO `_migration_0014_mia_login_guard` (`ok`)
SELECT CASE WHEN
	(
		SELECT count(*)
		FROM `salon_users`
		WHERE lower(trim(`email`)) IN ('former.staff@example.com','staff@example.com')
	) = 1
	AND (
		SELECT count(*)
		FROM `salon_users`
		WHERE `employee_id` = 'mia'
	) = 1
	AND EXISTS (
		SELECT 1
		FROM `salon_users`
		WHERE lower(trim(`email`)) IN ('former.staff@example.com','staff@example.com')
			AND `role` = 'staff'
			AND `employee_id` = 'mia'
			AND `active` = 1
			AND `removed_at` IS NULL
	)
THEN 1 ELSE 0 END;
--> statement-breakpoint
UPDATE `salon_users`
SET
	`email` = 'staff@example.com',
	`updated_at` = CASE
		WHEN lower(trim(`email`)) = 'staff@example.com' THEN `updated_at`
		ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now')
	END
WHERE lower(trim(`email`)) IN ('former.staff@example.com','staff@example.com')
	AND `role` = 'staff'
	AND `employee_id` = 'mia'
	AND `active` = 1;
--> statement-breakpoint
DELETE FROM `calendar_oauth_states`
WHERE `employee_id` = 'mia'
	OR lower(trim(`user_email`)) IN ('former.staff@example.com','staff@example.com');
--> statement-breakpoint
INSERT OR IGNORE INTO `admin_audit_log`
	(`id`,`actor_email`,`action`,`target_type`,`target_id`,`details`,`created_at`)
VALUES
	('migration-0014-mia-email','system','user_email_changed','salon_user','salon-staff-mia','{"email":"staff@example.com"}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
--> statement-breakpoint
DROP TABLE `_migration_0014_mia_login_guard`;
