PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text,
	`week_start` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_meal_plans`(`id`, `user_id`, `name`, `week_start`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `name`, `week_start`, `created_at`, `updated_at` FROM `meal_plans`;--> statement-breakpoint
DROP TABLE `meal_plans`;--> statement-breakpoint
ALTER TABLE `__new_meal_plans` RENAME TO `meal_plans`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `meal_plans_user_id_idx` ON `meal_plans` (`user_id`);
