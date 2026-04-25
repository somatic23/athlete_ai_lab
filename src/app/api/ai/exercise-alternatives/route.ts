import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, exercises } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseI18n } from "@/lib/utils/i18n";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import { generateObject, generateText } from "ai";
import { logger } from "@/lib/utils/logger";
import { extractJsonObject } from "@/lib/utils/extract-json";

// Muscle groups to include in the catalog when suggesting alternatives
const ADJACENT_MUSCLES: Record<string, string[]> = {
  chest:       ["chest", "triceps", "shoulders"],
  back:        ["back", "biceps", "forearms"],
  shoulders:   ["shoulders", "triceps", "chest", "back"],
  biceps:      ["biceps", "back", "forearms"],
  triceps:     ["triceps", "chest", "shoulders"],
  forearms:    ["forearms", "biceps", "back"],
  quadriceps:  ["quadriceps", "glutes", "hamstrings"],
  hamstrings:  ["hamstrings", "glutes", "quadriceps"],
  glutes:      ["glutes", "hamstrings", "quadriceps"],
  calves:      ["calves", "quadriceps"],
  core:        ["core", "full_body"],
  full_body:   ["full_body", "core", "quadriceps", "back", "chest"],
};

const requestSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  primaryMuscleGroup: z.string(),
  sets: z.number().int().min(1).max(20),
  repsMin: z.number().int().min(1).max(999),
  repsMax: z.number().int().min(1).max(999).nullable().optional(),
  suggestedWeightKg: z.number().min(0).nullable().optional(),
});

const alternativeItemSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  sets: z.number().int().min(1).max(20),
  repsMin: z.number().int().min(1).max(999),
  repsMax: z.number().int().min(1).max(999).nullable().optional(),
  suggestedWeightKg: z.number().min(0).nullable().optional(),
  reason: z.string(),
});

const responseSchema = z.object({
  alternatives: z.array(alternativeItemSchema).min(1).max(3),
});

const lenientResponseSchema = z.object({
  alternatives: z.array(z.object({
    exerciseId: z.string(),
    exerciseName: z.string().optional().default(""),
    sets: z.number().int().min(1).max(20),
    repsMin: z.number().int().min(1).max(999),
    repsMax: z.number().int().min(1).max(999).nullable().optional(),
    suggestedWeightKg: z.number().min(0).nullable().optional(),
    reason: z.string().optional().default(""),
  })).min(1).max(3),
});

// POST /api/ai/exercise-alternatives
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }
  const { exerciseId, exerciseName, primaryMuscleGroup, sets, repsMin, repsMax, suggestedWeightKg } = parsed.data;

  // User locale
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { preferredLocale: true },
  });
  const locale = (userRow?.preferredLocale ?? "de") as "de" | "en";

  // Load exercise catalog filtered to relevant muscle groups
  const relevantMuscles = ADJACENT_MUSCLES[primaryMuscleGroup] ?? null;
  const allExercises = await db.query.exercises.findMany({
    where: and(eq(exercises.isActive, true)),
    columns: { id: true, nameI18n: true, primaryMuscleGroup: true },
  });

  const catalog = allExercises
    .filter((ex) => ex.id !== exerciseId && (!relevantMuscles || relevantMuscles.includes(ex.primaryMuscleGroup ?? "")))
    .slice(0, 50) // cap at 50 to keep prompt manageable
    .map((ex) => {
      const names = parseI18n(ex.nameI18n ?? "{}");
      return {
        id: ex.id,
        name: (locale === "en" ? names.en : names.de) || names.de || names.en || ex.id,
        muscle: ex.primaryMuscleGroup ?? "full_body",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  if (catalog.length === 0) {
    return NextResponse.json({ error: locale === "en" ? "No alternative exercises found." : "Keine alternativen Übungen gefunden." }, { status: 422 });
  }

  // Build catalog index for validation
  const catalogById = new Map(catalog.map((ex) => [ex.id, ex]));

  // Build prompts
  const catalogLines = catalog.map((ex) => `[exerciseId:${ex.id}] ${ex.name} (${ex.muscle})`).join("\n");
  const planStr = `${sets} × ${repsMin}${repsMax ? `–${repsMax}` : ""} Wdh${suggestedWeightKg != null ? `, ${suggestedWeightKg} kg` : ""}`;
  const schemaExample = `{"alternatives":[{"exerciseId":"...","exerciseName":"...","sets":4,"repsMin":8,"repsMax":12,"suggestedWeightKg":70.0,"reason":"..."}]}`;

  let systemPrompt: string;
  let userPrompt: string;

  if (locale === "en") {
    systemPrompt = `You are Atlas, an expert AI strength coach. Suggest 2–3 alternative exercises from the provided catalog. Choose alternatives that train the same or synergistic muscle groups. Adjust sets/reps/weight appropriately. You MUST use exact exerciseIds from the catalog — do not invent IDs. Respond ONLY with a valid JSON object.`;
    userPrompt = `CURRENT EXERCISE: ${exerciseName} (${primaryMuscleGroup})
CURRENT PLAN: ${planStr}

AVAILABLE ALTERNATIVES (use ONLY these exerciseIds):
${catalogLines}

TASK: Pick 2–3 alternatives. For each: use the exact exerciseId, suggest appropriate sets/reps/weight, explain the reason briefly (1 sentence).

OUTPUT JSON (respond with this exact structure):
${schemaExample}`;
  } else {
    systemPrompt = `Du bist Atlas, ein erfahrener KI-Krafttrainer. Schlage 2–3 alternative Übungen aus dem bereitgestellten Katalog vor. Wähle Alternativen, die dieselben oder synergetische Muskelgruppen trainieren. Passe Sätze/Wiederholungen/Gewicht an. Du MUSST die exakten exerciseIds aus dem Katalog verwenden — erfinde keine IDs. Antworte NUR mit einem gültigen JSON-Objekt.`;
    userPrompt = `AKTUELLE ÜBUNG: ${exerciseName} (${primaryMuscleGroup})
AKTUELLER PLAN: ${planStr}

VERFÜGBARE ALTERNATIVEN (NUR diese exerciseIds verwenden):
${catalogLines}

AUFGABE: Wähle 2–3 Alternativen. Für jede: exakte exerciseId verwenden, passende Sätze/Wdh/Gewicht vorschlagen, Begründung kurz erklären (1 Satz).

OUTPUT JSON (antworte mit genau dieser Struktur):
${schemaExample}`;
  }

  await logger.info("ai:exercise_alternatives:prompt", {
    userId: session.user.id,
    metadata: { exerciseId, system: systemPrompt, prompt: userPrompt },
  });

  let model;
  try {
    model = await getDefaultModel();
  } catch (err) {
    await logger.error("ai:exercise_alternatives:no_model", {
      userId: session.user.id,
      metadata: { exerciseId, error: String(err) },
    });
    return NextResponse.json(
      { error: locale === "en" ? "No AI provider configured." : "Kein AI-Provider konfiguriert." },
      { status: 503 }
    );
  }

  type AiResult = z.infer<typeof responseSchema>;
  let result: AiResult | null = null;

  try {
    const r = await generateObject({ model, schema: responseSchema, system: systemPrompt, prompt: userPrompt });
    result = r.object;
    await logger.debug("ai:exercise_alternatives:raw_response", {
      userId: session.user.id,
      metadata: { exerciseId, response: result },
    });
  } catch (genObjErr) {
    await logger.warn("ai:exercise_alternatives:generateObject_failed", {
      userId: session.user.id,
      metadata: { exerciseId, error: String(genObjErr) },
    });
    try {
      const textResult = await generateText({ model, system: systemPrompt, prompt: userPrompt });
      await logger.debug("ai:exercise_alternatives:raw_response", {
        userId: session.user.id,
        metadata: { exerciseId, rawText: textResult.text },
      });
      const jsonObj = extractJsonObject(textResult.text);
      if (jsonObj) {
        const p = lenientResponseSchema.safeParse(jsonObj);
        if (p.success) result = p.data as AiResult;
        else await logger.warn("ai:exercise_alternatives:schema_mismatch", {
          userId: session.user.id,
          metadata: { exerciseId, issues: p.error.issues.map((i) => i.message) },
        });
      }
    } catch (fallbackErr) {
      await logger.error("ai:exercise_alternatives:fallback_failed", {
        userId: session.user.id,
        metadata: { exerciseId, error: String(fallbackErr) },
      });
    }
  }

  if (!result) {
    return NextResponse.json(
      { error: locale === "en" ? "AI failed to generate alternatives." : "KI konnte keine Alternativen erzeugen." },
      { status: 502 }
    );
  }

  // Validate: keep only alternatives with valid exerciseIds from catalog
  const validated = result.alternatives
    .filter((alt) => catalogById.has(alt.exerciseId))
    .map((alt) => {
      const catalogEntry = catalogById.get(alt.exerciseId)!;
      return {
        exerciseId: alt.exerciseId,
        exerciseName: alt.exerciseName || catalogEntry.name,
        primaryMuscleGroup: catalogEntry.muscle,
        sets: alt.sets,
        repsMin: alt.repsMin,
        repsMax: alt.repsMax ?? null,
        suggestedWeightKg: alt.suggestedWeightKg ?? null,
        reason: alt.reason,
      };
    });

  if (validated.length === 0) {
    await logger.warn("ai:exercise_alternatives:invalid_ids", {
      userId: session.user.id,
      metadata: { exerciseId, returnedIds: result.alternatives.map((a) => a.exerciseId) },
    });
    return NextResponse.json(
      { error: locale === "en" ? "AI returned invalid exercise IDs." : "KI hat ungültige Übungs-IDs zurückgegeben." },
      { status: 502 }
    );
  }

  await logger.info("ai:exercise_alternatives:response", {
    userId: session.user.id,
    metadata: { exerciseId, alternatives: validated },
  });

  return NextResponse.json({ alternatives: validated });
}
