CREATE TABLE `price_list_items` (
	`item_id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`name` text,
	`note` text,
	`prices_json` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`custom` integer DEFAULT false NOT NULL,
	`updated_by_email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `price_list_items_table_order_idx` ON `price_list_items` (`table_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `price_list_items_active_idx` ON `price_list_items` (`active`);