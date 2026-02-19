-- Replace single targetReps with targetRepsMin/targetRepsMax for rep ranges

-- workout_exercises: rename target_reps → target_reps_min, add target_reps_max
ALTER TABLE `workout_exercises` RENAME COLUMN `target_reps` TO `target_reps_min`;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_reps_max` integer;--> statement-breakpoint
UPDATE `workout_exercises` SET `target_reps_max` = `target_reps_min`;--> statement-breakpoint

-- session_planned_exercises: rename target_reps → target_reps_min, add target_reps_max
ALTER TABLE `session_planned_exercises` RENAME COLUMN `target_reps` TO `target_reps_min`;--> statement-breakpoint
ALTER TABLE `session_planned_exercises` ADD `target_reps_max` integer;--> statement-breakpoint
UPDATE `session_planned_exercises` SET `target_reps_max` = `target_reps_min`;
