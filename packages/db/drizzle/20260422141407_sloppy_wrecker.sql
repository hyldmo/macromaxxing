CREATE TABLE `exercise_guides` (
	`id` text PRIMARY KEY,
	`exercise_id` text NOT NULL,
	`description` text NOT NULL,
	`cues` text NOT NULL,
	`pitfalls` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_exercise_guides_exercise_id_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_guides_exercise_id_idx` ON `exercise_guides` (`exercise_id`);