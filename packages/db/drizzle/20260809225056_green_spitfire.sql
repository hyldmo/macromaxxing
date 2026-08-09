CREATE TABLE IF NOT EXISTS `workout_skips` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workout_id` text NOT NULL,
	`skipped_at` integer NOT NULL,
	CONSTRAINT `fk_workout_skips_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_workout_skips_workout_id_workouts_id_fk` FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workout_skips_user_id_idx` ON `workout_skips` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workout_skips_workout_id_idx` ON `workout_skips` (`workout_id`);
