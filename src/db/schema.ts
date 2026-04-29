import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  type EquipmentCategory,
} from "@/lib/equipment-categories";

// =============================================
// CORE TABLES
// =============================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  displayName: text("display_name").notNull(),
  birthDate: text("birth_date"), // ISO date YYYY-MM-DD
  gender: text("gender", { enum: ["male", "female", "diverse"] }),
  weightKg: real("weight_kg"),
  heightCm: integer("height_cm"),
  bodyFatPct: real("body_fat_pct"),
  goals: text("goals"),
  experienceLevel: text("experience_level", {
    enum: ["beginner", "intermediate", "advanced", "expert"],
  }),
  injuriesLimitations: text("injuries_limitations"),
  preferredLocale: text("preferred_locale").$type<"de" | "en">().notNull().default("de"),
  coachPersonality: text("coach_personality").$type<import("@/lib/coach-personalities").CoachPersonality>().notNull().default("atlas"),
  avatarUrl: text("avatar_url"),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const bodyMeasurements = sqliteTable("body_measurements", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  measuredAt: text("measured_at").notNull(), // YYYY-MM-DD
  weightKg: real("weight_kg").notNull(),
  bodyFatPct: real("body_fat_pct"),
  waistCm: real("waist_cm"),
  chestCm: real("chest_cm"),
  hipCm: real("hip_cm"),
  armCm: real("arm_cm"),
  thighCm: real("thigh_cm"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Re-export for server-side code that imports from schema
export { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABELS, type EquipmentCategory };

/** @deprecated Use EQUIPMENT_CATEGORY_LABELS[cat].de instead */
export const EQUIPMENT_CATEGORY_LABELS_DE: Record<EquipmentCategory, string> = Object.fromEntries(
  Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([k, v]) => [k, v.de])
) as Record<EquipmentCategory, string>;

export const equipment = sqliteTable("equipment", {
  id: text("id").primaryKey(),
  nameI18n: text("name_i18n").notNull(), // JSON: { de: string; en: string }
  descriptionI18n: text("description_i18n"), // JSON: { de: string; en: string }
  imageUrl: text("image_url"),
  category: text("category").$type<EquipmentCategory>(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const userEquipment = sqliteTable("user_equipment", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  equipmentId: text("equipment_id")
    .notNull()
    .references(() => equipment.id, { onDelete: "cascade" }),
});

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  nameI18n: text("name_i18n").notNull(), // JSON: { de: string; en: string }
  descriptionI18n: text("description_i18n"), // JSON: { de: string; en: string }
  imageUrl: text("image_url"),
  primaryMuscleGroup: text("primary_muscle_group", {
    enum: [
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "forearms",
      "quadriceps",
      "hamstrings",
      "glutes",
      "calves",
      "core",
      "full_body",
    ],
  }).notNull(),
  secondaryMuscleGroups: text("secondary_muscle_groups"), // JSON array
  requiredEquipmentIds: text("required_equipment_ids"), // JSON array
  instructions: text("instructions"),
  trackingType: text("tracking_type", { enum: ["weight_reps", "duration"] })
    .notNull()
    .default("weight_reps"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// AI PROVIDER CONFIGURATION
// =============================================

export const aiProviders = sqliteTable("ai_providers", {
  id: text("id").primaryKey(),
  provider: text("provider", {
    enum: ["openai", "anthropic", "gemini", "openrouter", "ollama"],
  }).notNull(),
  displayName: text("display_name").notNull(),
  apiKey: text("api_key"),
  baseUrl: text("base_url"),
  modelId: text("model_id").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  isDefault: integer("is_default", { mode: "boolean" })
    .notNull()
    .default(false),
  config: text("config"), // JSON: temperature, max_tokens, etc.
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// TRAINING PLANS
// =============================================

export const trainingPlans = sqliteTable("training_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["draft", "active", "scheduled", "archived"],
  })
    .notNull()
    .default("draft"),
  aiGenerated: integer("ai_generated", { mode: "boolean" })
    .notNull()
    .default(false),
  planData: text("plan_data"), // JSON: full AI-generated plan
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const trainingDays = sqliteTable("training_days", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => trainingPlans.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull(),
  focus: text("focus"),
  estimatedDurationMin: integer("estimated_duration_min"),
  sortOrder: integer("sort_order").notNull().default(0),
  pendingAiSuggestion: text("pending_ai_suggestion"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const planExercises = sqliteTable("plan_exercises", {
  id: text("id").primaryKey(),
  trainingDayId: text("training_day_id")
    .notNull()
    .references(() => trainingDays.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  sortOrder: integer("sort_order").notNull().default(0),
  supersetGroup: text("superset_group"),
  sets: integer("sets").notNull().default(3),
  repsMin: integer("reps_min").notNull().default(8),
  repsMax: integer("reps_max").default(12),
  durationSeconds: integer("duration_seconds"),
  targetRpe: real("target_rpe"),
  restSeconds: integer("rest_seconds").default(90),
  tempo: text("tempo"),
  suggestedWeightKg: real("suggested_weight_kg"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// CALENDAR / SCHEDULING
// =============================================

export const scheduledEvents = sqliteTable("scheduled_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trainingDayId: text("training_day_id").references(() => trainingDays.id, {
    onDelete: "set null",
  }),
  eventType: text("event_type", {
    enum: ["training_day", "rest", "cardio", "custom"],
  })
    .notNull()
    .default("training_day"),
  scheduledDate: text("scheduled_date").notNull(),
  title: text("title"),
  notes: text("notes"),
  isCompleted: integer("is_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// WORKOUT LOGGING
// =============================================

export const workoutSessions = sqliteTable("workout_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scheduledEventId: text("scheduled_event_id").references(
    () => scheduledEvents.id,
    { onDelete: "set null" }
  ),
  trainingDayId: text("training_day_id").references(() => trainingDays.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  startedAt: text("started_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
  durationSeconds: integer("duration_seconds"),
  // Post-workout survey
  perceivedLoad: text("perceived_load", {
    enum: ["light", "moderate", "heavy", "very_heavy", "maximal"],
  }),
  satisfactionRating: integer("satisfaction_rating"),
  feedbackText: text("feedback_text"),
  aiFeedback: text("ai_feedback"),
  // Aggregated metrics
  totalVolumeKg: real("total_volume_kg"),
  totalSets: integer("total_sets"),
  totalReps: integer("total_reps"),
  muscleGroupsTrained: text("muscle_groups_trained"), // JSON array
  sessionRpeAvg: real("session_rpe_avg"),
  aiAnalysisCompleted: integer("ai_analysis_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const workoutSets = sqliteTable("workout_sets", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  planExerciseId: text("plan_exercise_id").references(() => planExercises.id),
  setNumber: integer("set_number").notNull(),
  weightKg: real("weight_kg"),
  repsCompleted: integer("reps_completed"),
  targetReps: integer("target_reps"),
  rpe: real("rpe"),
  outcome: text("outcome", {
    enum: ["completed", "failure", "partial", "skipped"],
  })
    .notNull()
    .default("completed"),
  tempo: text("tempo"),
  durationSeconds: integer("duration_seconds"),
  restBeforeSeconds: integer("rest_before_seconds"),
  timeUnderTensionSeconds: integer("time_under_tension_seconds"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const workoutExerciseSummary = sqliteTable("workout_exercise_summary", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  totalVolumeKg: real("total_volume_kg"),
  maxWeightKg: real("max_weight_kg"),
  totalReps: integer("total_reps"),
  avgRpe: real("avg_rpe"),
  estimated1rm: real("estimated_1rm"),
  previousEstimated1rm: real("previous_estimated_1rm"),
  performanceDeltaPct: real("performance_delta_pct"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// PERSONAL RECORDS
// =============================================

export const personalRecords = sqliteTable("personal_records", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  recordType: text("record_type", {
    enum: ["1rm", "volume", "reps"],
  }).notNull(),
  weightKg: real("weight_kg").notNull(),
  reps: integer("reps").notNull().default(1),
  estimated1rm: real("estimated_1rm"),
  previousRecordValue: real("previous_record_value"),
  achievedAt: text("achieved_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  workoutSetId: text("workout_set_id").references(() => workoutSets.id),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// ANALYTICS
// =============================================

export const muscleGroupLoadLog = sqliteTable("muscle_group_load_log", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  muscleGroup: text("muscle_group", {
    enum: [
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "forearms",
      "quadriceps",
      "hamstrings",
      "glutes",
      "calves",
      "core",
      "full_body",
    ],
  }).notNull(),
  totalVolumeKg: real("total_volume_kg"),
  totalSets: integer("total_sets"),
  estimatedRecoveryHours: integer("estimated_recovery_hours"),
  fullyRecoveredAt: text("fully_recovered_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const progressionSnapshots = sqliteTable("progression_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  weekStart: text("week_start").notNull(),
  avg1rm: real("avg_1rm"),
  totalVolume: real("total_volume"),
  trendDirection: text("trend_direction", {
    enum: ["up", "plateau", "down"],
  }),
  weeksInTrend: integer("weeks_in_trend"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const muscleGroupLandmarks = sqliteTable("muscle_group_landmarks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  muscleGroup: text("muscle_group", {
    enum: [
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "forearms",
      "quadriceps",
      "hamstrings",
      "glutes",
      "calves",
      "core",
      "full_body",
    ],
  }).notNull(),
  mv: integer("mv").notNull(),
  mev: integer("mev").notNull(),
  mav: integer("mav").notNull(),
  mrv: integer("mrv").notNull(),
  source: text("source", { enum: ["default", "manual", "adapted"] })
    .notNull()
    .default("default"),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const aiAnalysisReports = sqliteTable("ai_analysis_reports", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => workoutSessions.id, {
    onDelete: "set null",
  }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  analysisType: text("analysis_type", {
    enum: ["post_workout", "weekly", "monthly"],
  }).notNull(),
  report: text("report"), // JSON: full structured report
  highlights: text("highlights"), // JSON array
  warnings: text("warnings"), // JSON array
  recommendations: text("recommendations"), // JSON array
  plateauDetectedExercises: text("plateau_detected_exercises"), // JSON array
  overloadDetectedMuscles: text("overload_detected_muscles"), // JSON array
  newPrs: text("new_prs"), // JSON array
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// AI CHAT
// =============================================

export const chatConversations = sqliteTable("chat_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  context: text("context"), // 'onboarding', 'plan_creation', 'post_workout', 'general'
  relatedPlanId: text("related_plan_id").references(() => trainingPlans.id),
  relatedSessionId: text("related_session_id").references(
    () => workoutSessions.id,
    { onDelete: "set null" }
  ),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// ADMIN: LOG FILES
// =============================================

export const appLogs = sqliteTable("app_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: text("level", {
    enum: ["debug", "info", "warn", "error"],
  })
    .notNull()
    .default("info"),
  message: text("message").notNull(),
  metadata: text("metadata"), // JSON
  userId: text("user_id").references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// RELATIONS
// =============================================

export const usersRelations = relations(users, ({ many }) => ({
  equipment: many(userEquipment),
  trainingPlans: many(trainingPlans),
  scheduledEvents: many(scheduledEvents),
  workoutSessions: many(workoutSessions),
  personalRecords: many(personalRecords),
  chatConversations: many(chatConversations),
  bodyMeasurements: many(bodyMeasurements),
}));

export const bodyMeasurementsRelations = relations(bodyMeasurements, ({ one }) => ({
  user: one(users, {
    fields: [bodyMeasurements.userId],
    references: [users.id],
  }),
}));

export const trainingPlansRelations = relations(
  trainingPlans,
  ({ one, many }) => ({
    user: one(users, {
      fields: [trainingPlans.userId],
      references: [users.id],
    }),
    days: many(trainingDays),
  })
);

export const trainingDaysRelations = relations(
  trainingDays,
  ({ one, many }) => ({
    plan: one(trainingPlans, {
      fields: [trainingDays.planId],
      references: [trainingPlans.id],
    }),
    exercises: many(planExercises),
  })
);

export const scheduledEventsRelations = relations(scheduledEvents, ({ one }) => ({
  user: one(users, {
    fields: [scheduledEvents.userId],
    references: [users.id],
  }),
  trainingDay: one(trainingDays, {
    fields: [scheduledEvents.trainingDayId],
    references: [trainingDays.id],
  }),
}));

export const planExercisesRelations = relations(planExercises, ({ one }) => ({
  trainingDay: one(trainingDays, {
    fields: [planExercises.trainingDayId],
    references: [trainingDays.id],
  }),
  exercise: one(exercises, {
    fields: [planExercises.exerciseId],
    references: [exercises.id],
  }),
}));

export const workoutSessionsRelations = relations(
  workoutSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [workoutSessions.userId],
      references: [users.id],
    }),
    sets: many(workoutSets),
    exerciseSummaries: many(workoutExerciseSummary),
  })
);

export const workoutSetsRelations = relations(workoutSets, ({ one }) => ({
  session: one(workoutSessions, {
    fields: [workoutSets.sessionId],
    references: [workoutSessions.id],
  }),
  exercise: one(exercises, {
    fields: [workoutSets.exerciseId],
    references: [exercises.id],
  }),
}));

export const workoutExerciseSummaryRelations = relations(workoutExerciseSummary, ({ one }) => ({
  session: one(workoutSessions, {
    fields: [workoutExerciseSummary.sessionId],
    references: [workoutSessions.id],
  }),
  exercise: one(exercises, {
    fields: [workoutExerciseSummary.exerciseId],
    references: [exercises.id],
  }),
}));

export const chatConversationsRelations = relations(
  chatConversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [chatConversations.userId],
      references: [users.id],
    }),
    messages: many(chatMessages),
  })
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));
