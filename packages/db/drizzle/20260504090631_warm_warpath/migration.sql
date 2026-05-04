CREATE TABLE `workout_program_items` (
	`id` text PRIMARY KEY,
	`program_id` text NOT NULL,
	`workout_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_workout_program_items_program_id_workout_programs_id_fk` FOREIGN KEY (`program_id`) REFERENCES `workout_programs`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workout_program_items_workout_id_workouts_id_fk` FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workout_programs` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_workout_programs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `active_program_id` text REFERENCES workout_programs(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `workout_program_items_program_id_idx` ON `workout_program_items` (`program_id`);--> statement-breakpoint
CREATE INDEX `workout_program_items_workout_id_idx` ON `workout_program_items` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_programs_user_id_idx` ON `workout_programs` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workout_programs_user_name_idx` ON `workout_programs` (`user_id`,`name`);