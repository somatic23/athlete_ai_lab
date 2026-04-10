CREATE TABLE `ai_analysis_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`analysis_type` text NOT NULL,
	`report` text,
	`highlights` text,
	`warnings` text,
	`recommendations` text,
	`plateau_detected_exercises` text,
	`overload_detected_muscles` text,
	`new_prs` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`display_name` text NOT NULL,
	`api_key` text,
	`base_url` text,
	`model_id` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`config` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`context` text,
	`related_plan_id` text,
	`related_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_plan_id`) REFERENCES `training_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name_i18n` text NOT NULL,
	`description_i18n` text,
	`image_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name_i18n` text NOT NULL,
	`description_i18n` text,
	`image_url` text,
	`primary_muscle_group` text NOT NULL,
	`secondary_muscle_groups` text,
	`required_equipment_ids` text,
	`instructions` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `muscle_group_load_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`muscle_group` text NOT NULL,
	`total_volume_kg` real,
	`total_sets` integer,
	`estimated_recovery_hours` integer,
	`fully_recovered_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`record_type` text NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer DEFAULT 1 NOT NULL,
	`estimated_1rm` real,
	`previous_record_value` real,
	`achieved_at` text NOT NULL,
	`workout_set_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workout_set_id`) REFERENCES `workout_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plan_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`training_day_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`superset_group` text,
	`sets` integer DEFAULT 3 NOT NULL,
	`reps_min` integer DEFAULT 8 NOT NULL,
	`reps_max` integer DEFAULT 12,
	`target_rpe` real,
	`rest_seconds` integer DEFAULT 90,
	`tempo` text,
	`suggested_weight_kg` real,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`training_day_id`) REFERENCES `training_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `progression_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`week_start` text NOT NULL,
	`avg_1rm` real,
	`total_volume` real,
	`trend_direction` text,
	`weeks_in_trend` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scheduled_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`training_day_id` text,
	`event_type` text DEFAULT 'training_day' NOT NULL,
	`scheduled_date` text NOT NULL,
	`title` text,
	`notes` text,
	`is_completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`training_day_id`) REFERENCES `training_days`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `training_days` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`day_number` integer NOT NULL,
	`title` text NOT NULL,
	`focus` text,
	`estimated_duration_min` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `training_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `training_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`ai_generated` integer DEFAULT false NOT NULL,
	`plan_data` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_equipment` (
	`user_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`display_name` text NOT NULL,
	`age` integer,
	`gender` text,
	`weight_kg` real,
	`height_cm` integer,
	`body_fat_pct` real,
	`goals` text,
	`experience_level` text,
	`injuries_limitations` text,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workout_exercise_summary` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`total_volume_kg` real,
	`max_weight_kg` real,
	`total_reps` integer,
	`avg_rpe` real,
	`estimated_1rm` real,
	`previous_estimated_1rm` real,
	`performance_delta_pct` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scheduled_event_id` text,
	`training_day_id` text,
	`title` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`duration_seconds` integer,
	`perceived_load` text,
	`satisfaction_rating` integer,
	`feedback_text` text,
	`ai_feedback` text,
	`total_volume_kg` real,
	`total_sets` integer,
	`total_reps` integer,
	`muscle_groups_trained` text,
	`session_rpe_avg` real,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scheduled_event_id`) REFERENCES `scheduled_events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`training_day_id`) REFERENCES `training_days`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`plan_exercise_id` text,
	`set_number` integer NOT NULL,
	`weight_kg` real,
	`reps_completed` integer,
	`target_reps` integer,
	`rpe` real,
	`outcome` text DEFAULT 'completed' NOT NULL,
	`tempo` text,
	`rest_before_seconds` integer,
	`time_under_tension_seconds` integer,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_exercise_id`) REFERENCES `plan_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
