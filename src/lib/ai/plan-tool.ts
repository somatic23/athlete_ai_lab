import { z } from "zod";
import { tool } from "ai";
import { generatedPlanSchema } from "./plan-schema";

/**
 * Tool input = generated plan + supplementary coach notes.
 * The coach calls this tool instead of writing JSON inline in a text reply.
 * The client renders the plan inline as a preview card; the user then
 * accepts the plan (→ persisted via /api/plans) or continues iterating.
 */
// Extend the shared plan schema with tool-only guidance. We redescribe the
// fields the model tends to confuse (trainingDays vs. trainingDaysPerWeek).
export const planProposalSchema = generatedPlanSchema
  .extend({
    trainingDaysPerWeek: generatedPlanSchema.shape.trainingDaysPerWeek.describe(
      "Integer count, e.g. 3. Just a NUMBER — not an array and not day names."
    ),
    trainingDays: generatedPlanSchema.shape.trainingDays.describe(
      "Array of full training-day OBJECTS (NOT weekday names). Each entry MUST be an object with dayName, focus, estimatedDurationMinutes, and exercises[]. Each exercise MUST be an object with exerciseId, exerciseName, sets, reps, weightSuggestion, restSeconds, notes. Length must equal trainingDaysPerWeek."
    ),
    coachNotes: z
      .string()
      .describe(
        "Supplementary notes: key design choices, progression strategy, what the athlete should watch for. Plain text, 2-5 short sentences. Same language as the conversation."
      ),
  });

export type PlanProposal = z.infer<typeof planProposalSchema>;

/**
 * The coach "renders" a training plan proposal to the user by calling this
 * tool. Execute is a pass-through — the real effect happens on the client
 * (inline preview) and on accept (POST /api/plans).
 */
export const proposeTrainingPlanTool = tool({
  description:
    "Propose a complete training plan. DO NOT call on the first turn. Call only AFTER you have gathered the athlete's answers to at least: current training goal, days per week available, session length, and any injuries/constraints. `trainingDays` must be an array of full day objects (NOT weekday names). Every exercise must use an exact exerciseId from the catalog in the system prompt.",
  inputSchema: planProposalSchema,
  execute: async (proposal) => {
    return { ok: true as const, planName: proposal.planName };
  },
});
