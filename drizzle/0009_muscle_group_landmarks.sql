CREATE TABLE IF NOT EXISTS `muscle_group_landmarks` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `muscle_group` text NOT NULL,
  `mv` integer NOT NULL,
  `mev` integer NOT NULL,
  `mav` integer NOT NULL,
  `mrv` integer NOT NULL,
  `source` text DEFAULT 'default' NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `muscle_group_landmarks_user_muscle`
  ON `muscle_group_landmarks` (`user_id`, `muscle_group`);
