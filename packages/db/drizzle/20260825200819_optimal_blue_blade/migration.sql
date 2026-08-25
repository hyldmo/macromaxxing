-- Hand-written. drizzle-kit's version of this rebuild drops every meal plan slot and converts
-- nothing. Keep it hand-written if this shape changes again.
--
-- `meal_plan_inventory` stops pointing only at recipes. A bare ingredient used to be wrapped in a
-- hidden `type: 'ingredient'` recipe, and a packaged product in a `type: 'premade'` one. Both are
-- one recipe holding one ingredient, so both collapse into an `ingredient_id` here.
--
-- The unit every conversion turns on is ONE PORTION IN GRAMS, and it is
-- `portion_size ?? cooked_weight ?? raw total` (getEffectivePortionSize over
-- getEffectiveCookedWeight, packages/db/macros.ts). Reading only `cooked_weight` looks right and
-- silently inflates the five premades that set a portion size: REMA Frukt & Nottemix declares a
-- 100 g portion in a 600 g bag, so every slot of it would have become six.

-- 1. A premade kept the product page on the recipe. Ingredients had nowhere to put it.
ALTER TABLE `ingredients` ADD `source_url` text;--> statement-breakpoint

-- 2. Every wrapper and premade, with the ingredient it wraps and what one of its portions weighed.
CREATE TABLE IF NOT EXISTS `_wrapped` AS
SELECT `r`.`id` AS `recipe_id`,
	`r`.`type` AS `kind`,
	`ri`.`ingredient_id` AS `ingredient_id`,
	COALESCE(`r`.`portion_size`, `r`.`cooked_weight`, `ri`.`amount_grams`) AS `portion_grams`,
	`r`.`source_url` AS `source_url`
FROM `recipes` `r`
JOIN `recipe_ingredients` `ri` ON `ri`.`recipe_id` = `r`.`id`
WHERE `r`.`type` IN ('ingredient', 'premade') AND `ri`.`ingredient_id` IS NOT NULL;--> statement-breakpoint

UPDATE `ingredients` SET `source_url` = (
	SELECT `w`.`source_url` FROM `_wrapped` `w` WHERE `w`.`ingredient_id` = `ingredients`.`id`
) WHERE `id` IN (SELECT `ingredient_id` FROM `_wrapped` WHERE `source_url` IS NOT NULL);--> statement-breakpoint

-- 3. A premade's portion size WAS its countable unit: one pizza, one box, one bar. Deleting the
--    recipe deletes the only place that number lived, so move it onto the ingredient as the unit
--    `recipe.addPremade` already creates for new ones. Without this the card falls back to grams
--    and stepping one pizza takes 34 taps at 10 g each.
--    Ids: lowercase hex is a subset of the Crockford base32 typeid alphabet, and a leading '0'
--    keeps the suffix inside 128 bits, so this mints a suffix that still parses as a TypeID.
INSERT INTO `ingredient_units` (`id`, `ingredient_id`, `name`, `grams`, `is_default`, `source`, `created_at`)
SELECT 'inu_0' || substr(lower(hex(randomblob(13))), 1, 25),
	`w`.`ingredient_id`,
	'pcs',
	`w`.`portion_grams`,
	1,
	'manual',
	CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `_wrapped` `w`
WHERE `w`.`kind` = 'premade'
	AND `w`.`portion_grams` > 0
	AND NOT EXISTS (
		SELECT 1 FROM `ingredient_units` `u` WHERE `u`.`ingredient_id` = `w`.`ingredient_id` AND `u`.`name` <> 'g'
	);--> statement-breakpoint

-- 4. One row per converted inventory row, resolved once so the slot UPDATE stays readable. Built
--    after step 3 so the units it just created are visible here.
CREATE TABLE IF NOT EXISTS `_conv` AS
SELECT `i`.`id` AS `inventory_id`,
	`w`.`kind` AS `kind`,
	`w`.`ingredient_id` AS `ingredient_id`,
	`w`.`portion_grams` AS `portion_grams`,
	(SELECT `u`.`name` FROM `ingredient_units` `u`
		WHERE `u`.`ingredient_id` = `w`.`ingredient_id` AND `u`.`name` <> 'g'
		ORDER BY `u`.`is_default` DESC LIMIT 1) AS `unit_name`,
	(SELECT `u`.`grams` FROM `ingredient_units` `u`
		WHERE `u`.`ingredient_id` = `w`.`ingredient_id` AND `u`.`name` <> 'g'
		ORDER BY `u`.`is_default` DESC LIMIT 1) AS `unit_grams`
FROM `meal_plan_inventory` `i`
JOIN `_wrapped` `w` ON `w`.`recipe_id` = `i`.`recipe_id`;--> statement-breakpoint

-- 5. Move the slot amounts onto the new basis while `inventory.recipe_id` can still say where a
--    slot came from. A premade portion was a package; an ingredient portion is 100 g.
--    Every SET expression reads the pre-update row, so `portions` below is the old value in all
--    three. Wrappers land on `portion_grams` = 100, so their amounts come through unchanged, and
--    they keep whatever display pair they already had: one logged on a scale stays in grams
--    rather than being relabelled with a unit nobody typed. Premades take the pcs reading.
UPDATE `meal_plan_slots` SET
	`display_amount` = COALESCE(`display_amount`, (
		SELECT CASE WHEN `c`.`kind` = 'premade' AND `c`.`unit_grams` > 0
			THEN `meal_plan_slots`.`portions` * `c`.`portion_grams` / `c`.`unit_grams` END
		FROM `_conv` `c` WHERE `c`.`inventory_id` = `meal_plan_slots`.`inventory_id`
	)),
	`display_unit` = COALESCE(`display_unit`, (
		SELECT CASE WHEN `c`.`kind` = 'premade' AND `c`.`unit_grams` > 0 THEN `c`.`unit_name` END
		FROM `_conv` `c` WHERE `c`.`inventory_id` = `meal_plan_slots`.`inventory_id`
	)),
	`portions` = `portions` * (
		SELECT `c`.`portion_grams` FROM `_conv` `c` WHERE `c`.`inventory_id` = `meal_plan_slots`.`inventory_id`
	) / 100.0
WHERE `inventory_id` IN (SELECT `inventory_id` FROM `_conv`);--> statement-breakpoint

-- 6. `meal_plan_slots` cascades off `meal_plan_inventory`, and the DROP below fires it. D1 scopes
--    PRAGMAs to a transaction and `migrations apply` does not run this file as one, so
--    `foreign_keys=OFF` does NOT hold. That is what cost the prod slots once already. Copy them
--    out and put them back after the rename.
CREATE TABLE IF NOT EXISTS `_bk_slots` AS SELECT * FROM `meal_plan_slots`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meal_plan_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_plan_id` text NOT NULL,
	`recipe_id` text,
	`ingredient_id` text,
	`total_portions` real NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `meal_plan_inventory_meal_plan_id_meal_plans_id_fk` FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON DELETE CASCADE,
	CONSTRAINT `meal_plan_inventory_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`),
	CONSTRAINT `fk_meal_plan_inventory_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`),
	CONSTRAINT "meal_plan_inventory_one_target" CHECK(("recipe_id" is null) <> ("ingredient_id" is null))
);
--> statement-breakpoint
-- A converted row swaps its recipe for the ingredient and rescales its pool the same way its
-- slots were rescaled. Everything else copies across untouched.
INSERT INTO `__new_meal_plan_inventory`(`id`, `meal_plan_id`, `recipe_id`, `ingredient_id`, `total_portions`, `created_at`)
SELECT `i`.`id`,
	`i`.`meal_plan_id`,
	CASE WHEN `c`.`inventory_id` IS NULL THEN `i`.`recipe_id` END,
	`c`.`ingredient_id`,
	CASE WHEN `c`.`inventory_id` IS NULL THEN `i`.`total_portions`
		ELSE `i`.`total_portions` * `c`.`portion_grams` / 100.0 END,
	`i`.`created_at`
FROM `meal_plan_inventory` `i`
LEFT JOIN `_conv` `c` ON `c`.`inventory_id` = `i`.`id`;--> statement-breakpoint
DROP TABLE `meal_plan_inventory`;--> statement-breakpoint
ALTER TABLE `__new_meal_plan_inventory` RENAME TO `meal_plan_inventory`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `meal_plan_inventory_meal_plan_id_idx` ON `meal_plan_inventory` (`meal_plan_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `meal_plan_slots` SELECT * FROM `_bk_slots`;--> statement-breakpoint

-- 7. Nothing points at the wrappers now. `recipe_ingredients` cascades off `recipes`.
DELETE FROM `recipes` WHERE `id` IN (SELECT `recipe_id` FROM `_wrapped`);--> statement-breakpoint

-- 8. Only real recipes are left, so the discriminator has one value and no reason to exist.
--    DROP COLUMN is not a table rebuild in SQLite, and nothing indexes `type`.
ALTER TABLE `recipes` DROP COLUMN `type`;--> statement-breakpoint

DROP TABLE `_bk_slots`;--> statement-breakpoint
DROP TABLE `_conv`;--> statement-breakpoint
DROP TABLE `_wrapped`;
