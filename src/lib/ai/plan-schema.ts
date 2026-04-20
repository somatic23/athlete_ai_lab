import { z } from "zod";

export const planExerciseSchema = z.object({
  exerciseId:       z.string().describe("ID from the exercise catalog"),
  exerciseName:     z.string().describe("Human-readable exercise name"),
  sets:             z.number().int().min(1).max(10),
  reps:             z.string().describe('Rep range as string, e.g. "8-12" or "5". Use "0" for duration-based exercises.'),
  durationSeconds:  z.number().int().min(10).max(7200).nullable().optional()
                      .describe("For time-based exercises (e.g. Plank, Laufen): target duration in seconds. Leave null for weight/reps exercises."),
  weightSuggestion: z.string().describe('e.g. "60 kg", "Bodyweight", "Start light"'),
  restSeconds:      z.number().int().min(0).max(300),
  notes:            z.string().describe("Technique cues or special instructions"),
});

export const planDaySchema = z.object({
  dayName:                  z.string().describe('e.g. "Tag A – Brust & Trizeps"'),
  focus:                    z.string().describe("Primary muscle groups trained"),
  estimatedDurationMinutes: z.number().int().min(30).max(120),
  exercises:                z.array(planExerciseSchema).min(1).max(8),
});

export const generatedPlanSchema = z.object({
  planName:           z.string(),
  goal:               z.string(),
  durationWeeks:      z.number().int().min(4).max(52),
  experienceLevel:    z.enum(["beginner", "intermediate", "advanced", "expert"]),
  trainingDaysPerWeek: z.number().int().min(2).max(6),
  trainingDays:       z.array(planDaySchema).min(1).max(7),
});

export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
