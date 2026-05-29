ALTER TABLE `ingredients` ADD `source_id` text;--> statement-breakpoint
UPDATE `ingredients` SET `source_id` = CAST(`fdc_id` AS text) WHERE `fdc_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `ingredients` DROP COLUMN `fdc_id`;