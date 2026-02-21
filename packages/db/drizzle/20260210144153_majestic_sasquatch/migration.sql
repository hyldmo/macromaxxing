ALTER TABLE `workout_exercises` ADD `set_mode` text DEFAULT 'working' NOT NULL;--> statement-breakpoint
ALTER TABLE `workouts` DROP COLUMN `color`;