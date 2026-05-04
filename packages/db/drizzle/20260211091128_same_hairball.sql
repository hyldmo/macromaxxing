ALTER TABLE `exercises` ADD `fatigue_tier` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `superset_group` integer;