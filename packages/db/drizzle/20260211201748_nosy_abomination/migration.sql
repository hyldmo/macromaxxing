PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`ingredient_id` text,
	`subrecipe_id` text,
	`amount_grams` real NOT NULL,
	`display_unit` text,
	`display_amount` real,
	`preparation` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subrecipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_recipe_ingredients`("id", "recipe_id", "ingredient_id", "subrecipe_id", "amount_grams", "display_unit", "display_amount", "preparation", "sort_order") SELECT "id", "recipe_id", "ingredient_id", NULL, "amount_grams", "display_unit", "display_amount", "preparation", "sort_order" FROM `recipe_ingredients`;--> statement-breakpoint
DROP TABLE `recipe_ingredients`;--> statement-breakpoint
ALTER TABLE `__new_recipe_ingredients` RENAME TO `recipe_ingredients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;