CREATE INDEX IF NOT EXISTS `ingredients_user_id_idx` ON `ingredients` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `meal_plan_inventory_meal_plan_id_idx` ON `meal_plan_inventory` (`meal_plan_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `meal_plan_slots_inventory_id_idx` ON `meal_plan_slots` (`inventory_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `meal_plans_user_id_idx` ON `meal_plans` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recipe_ingredients_recipe_id_idx` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recipes_user_id_idx` ON `recipes` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workout_exercises_workout_id_idx` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workout_logs_session_id_idx` ON `workout_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workout_sessions_user_id_idx` ON `workout_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workout_sessions_workout_id_idx` ON `workout_sessions` (`workout_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workouts_user_id_idx` ON `workouts` (`user_id`);