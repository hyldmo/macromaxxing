CREATE TABLE `user_exercise_favorites` (
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `user_exercise_favorites_pk` PRIMARY KEY(`user_id`, `exercise_id`),
	CONSTRAINT `fk_user_exercise_favorites_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_user_exercise_favorites_exercise_id_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `workout_logs_exercise_id_idx` ON `workout_logs` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `workout_logs_exercise_session_idx` ON `workout_logs` (`exercise_id`,`session_id`);