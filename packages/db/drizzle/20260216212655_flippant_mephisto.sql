CREATE TABLE `usda_foods` (
	`fdc_id` integer PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`data_type` text NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`kcal` real NOT NULL,
	`fiber` real NOT NULL,
	`density` real
);
--> statement-breakpoint
CREATE INDEX `usda_foods_description_idx` ON `usda_foods` (lower("description"));--> statement-breakpoint
CREATE TABLE `usda_portions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fdc_id` integer NOT NULL,
	`name` text NOT NULL,
	`grams` real NOT NULL,
	`is_volume` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`fdc_id`) REFERENCES `usda_foods`(`fdc_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `usda_portions_fdc_id_idx` ON `usda_portions` (`fdc_id`);