-- Populate hypertrophy rep ranges for compound exercises
UPDATE exercises SET hypertrophy_reps_min = 8, hypertrophy_reps_max = 12 WHERE id = 'exc_bench_press';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 8, hypertrophy_reps_max = 12 WHERE id = 'exc_incline_bench_press';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 8, hypertrophy_reps_max = 12 WHERE id = 'exc_overhead_press';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 8, hypertrophy_reps_max = 15 WHERE id = 'exc_barbell_row';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 6, hypertrophy_reps_max = 12 WHERE id = 'exc_pull_up';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 8, hypertrophy_reps_max = 12 WHERE id = 'exc_squat';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 8, hypertrophy_reps_max = 12 WHERE id = 'exc_deadlift';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 10, hypertrophy_reps_max = 15 WHERE id = 'exc_romanian_deadlift';--> statement-breakpoint
-- Populate hypertrophy rep ranges for isolation exercises
UPDATE exercises SET hypertrophy_reps_min = 12, hypertrophy_reps_max = 20 WHERE id = 'exc_lateral_raise';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 10, hypertrophy_reps_max = 15 WHERE id = 'exc_bicep_curl';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 10, hypertrophy_reps_max = 15 WHERE id = 'exc_tricep_extension';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 10, hypertrophy_reps_max = 15 WHERE id = 'exc_leg_curl';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 10, hypertrophy_reps_max = 15 WHERE id = 'exc_leg_extension';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 12, hypertrophy_reps_max = 20 WHERE id = 'exc_calf_raise';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 12, hypertrophy_reps_max = 20 WHERE id = 'exc_rear_delt_fly';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 15, hypertrophy_reps_max = 25 WHERE id = 'exc_face_pull';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 10, hypertrophy_reps_max = 15 WHERE id = 'exc_cable_fly';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 10, hypertrophy_reps_max = 15 WHERE id = 'exc_preacher_curl';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 10, hypertrophy_reps_max = 15 WHERE id = 'exc_hammer_curl';--> statement-breakpoint
UPDATE exercises SET hypertrophy_reps_min = 15, hypertrophy_reps_max = 25 WHERE id = 'exc_wrist_curl';
