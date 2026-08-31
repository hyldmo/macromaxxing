ALTER TABLE `users` ADD `last_push_subscription_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `last_rest_alert_test_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `last_rest_alert_scheduled_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `last_rest_alert_cancelled_at` integer;
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_push_subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `rest_notification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`queued_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_rest_notification_jobs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_rest_notification_jobs_session_id_workout_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_rest_notification_jobs_subscription_id_push_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "rest_notification_jobs_status_check" CHECK("status" in ('scheduled', 'sending', 'sent', 'cancelled', 'expired', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `rest_notification_jobs_user_id_idx` ON `rest_notification_jobs` (`user_id`);--> statement-breakpoint
CREATE INDEX `rest_notification_jobs_session_id_idx` ON `rest_notification_jobs` (`session_id`);--> statement-breakpoint
CREATE INDEX `rest_notification_jobs_subscription_id_idx` ON `rest_notification_jobs` (`subscription_id`);
