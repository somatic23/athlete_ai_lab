CREATE UNIQUE INDEX IF NOT EXISTS `progression_snapshots_user_ex_week`
  ON `progression_snapshots` (`user_id`, `exercise_id`, `week_start`);
