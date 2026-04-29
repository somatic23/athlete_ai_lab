import { z } from "zod";

export const suggestionExerciseSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  sets: z.number().int().min(1).max(20),
  repsMin: z.number().int().min(1).max(999),
  repsMax: z.number().int().min(1).max(999).nullable(),
  suggestedWeightKg: z.number().min(0).nullable(),
  notes: z.string(),
  changeType: z.enum(["progression", "deload", "maintenance", "recovery"]),
  changeReason: z.string(),
});

// AI output schema (no generatedAt — server injects it)
export const coachingSuggestionAiSchema = z.object({
  exercises: z.array(suggestionExerciseSchema).min(1),
  rationale: z.string(),
});

// Stored/returned schema (includes generatedAt + optional source for auto-trigger badge)
export const coachingSuggestionSchema = coachingSuggestionAiSchema.extend({
  generatedAt: z.string(),
  source: z.enum(["manual", "auto"]).optional(),
});

// Lenient fallback (all optional with defaults for generateText parse)
export const lenientSuggestionSchema = z.object({
  exercises: z.array(z.object({
    exerciseId: z.string(),
    exerciseName: z.string().optional().default(""),
    sets: z.number().int().min(1).max(20),
    repsMin: z.number().int().min(1).max(999),
    repsMax: z.number().nullable().optional(),
    suggestedWeightKg: z.number().nullable().optional(),
    notes: z.string().optional().default(""),
    changeType: z.enum(["progression", "deload", "maintenance", "recovery"]).optional().default("maintenance"),
    changeReason: z.string().optional().default(""),
  })).min(1),
  rationale: z.string().optional().default(""),
  generatedAt: z.string().optional().default(""),
  source: z.enum(["manual", "auto"]).optional(),
});

export type CoachingSuggestion = z.infer<typeof coachingSuggestionSchema>;
export type SuggestionExercise = z.infer<typeof suggestionExerciseSchema>;

// AI-only schema — LLM provides natural-language justification per exercise + overall rationale.
// Numbers (sets/reps/weight/changeType) come from the deterministic progression engine.
export const aiReasonsSchema = z.object({
  exercises: z.array(z.object({
    exerciseId: z.string(),
    changeReason: z.string(),
    notes: z.string().optional().default(""),
  })).min(1),
  rationale: z.string(),
});

export const lenientAiReasonsSchema = z.object({
  exercises: z.array(z.object({
    exerciseId: z.string(),
    changeReason: z.string().optional().default(""),
    notes: z.string().optional().default(""),
  })).optional().default([]),
  rationale: z.string().optional().default(""),
});

export type AiReasons = z.infer<typeof aiReasonsSchema>;
