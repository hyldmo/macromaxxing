CREATE INDEX `workout_logs_exercise_id_idx` ON `workout_logs` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `workout_logs_exercise_session_idx` ON `workout_logs` (`exercise_id`,`session_id`);