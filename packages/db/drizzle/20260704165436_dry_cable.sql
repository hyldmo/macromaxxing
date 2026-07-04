ALTER TABLE `exercises` ADD `bw_multiplier` real DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `exercises` SET `bw_multiplier` = 1 WHERE `id` = 'exc_pull_up';
