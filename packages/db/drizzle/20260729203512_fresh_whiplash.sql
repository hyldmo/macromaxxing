ALTER TABLE `meal_plans` ADD `week_start` text;--> statement-breakpoint
-- Every existing plan predates the column, and the old code read its week off `created_at`
-- (`isPlanForWeek`). Backfill that same inference so no plan silently becomes a template and drops
-- off the week calendar. `-6 days` then `weekday 1` lands on the Monday of the week containing the
-- timestamp. This resolves in UTC while the app derives weeks locally, so a plan created within a
-- few hours of midnight Monday can land a week off; the week is editable, and the pre-migration
-- value was equally arbitrary.
UPDATE `meal_plans`
SET `week_start` = date(`created_at` / 1000, 'unixepoch', '-6 days', 'weekday 1')
WHERE `week_start` IS NULL;
