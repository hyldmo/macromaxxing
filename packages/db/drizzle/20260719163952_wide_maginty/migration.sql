CREATE TABLE `exercise_equipment` (
	`id` text PRIMARY KEY,
	`exercise_id` text NOT NULL,
	`equipment` text NOT NULL,
	CONSTRAINT `fk_exercise_equipment_exercise_id_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `location_equipment` (
	`id` text PRIMARY KEY,
	`location_id` text NOT NULL,
	`equipment` text NOT NULL,
	CONSTRAINT `fk_location_equipment_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_locations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD `location_id` text REFERENCES locations(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `workouts` ADD `location_id` text REFERENCES locations(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `exercise_equipment_exercise_id_idx` ON `exercise_equipment` (`exercise_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_equipment_unique_idx` ON `exercise_equipment` (`exercise_id`,`equipment`);--> statement-breakpoint
CREATE INDEX `location_equipment_location_id_idx` ON `location_equipment` (`location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `location_equipment_unique_idx` ON `location_equipment` (`location_id`,`equipment`);--> statement-breakpoint
CREATE INDEX `locations_user_id_idx` ON `locations` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `locations_user_name_idx` ON `locations` (`user_id`,`name`);