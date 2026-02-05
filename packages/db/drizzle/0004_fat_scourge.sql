CREATE TABLE `ingredient_units` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`name` text NOT NULL,
	`grams` real NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `ingredients` ADD `density` real;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD `display_unit` text;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD `display_amount` real;