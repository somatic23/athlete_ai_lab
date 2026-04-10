import type { equipment, exercises, users } from "@/db/schema";
import { parseI18n } from "@/lib/utils/i18n";

type UserProfile = typeof users.$inferSelect;

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Anfaenger (< 1 Jahr)",
  intermediate: "Fortgeschritten (1–3 Jahre)",
  advanced: "Erfahren (3–5 Jahre)",
  expert: "Experte (5+ Jahre)",
};

const GENDER_LABELS: Record<string, string> = {
  male: "maennlich",
  female: "weiblich",
  diverse: "divers",
};

function profileSection(user: UserProfile | null): string {
  if (!user) return "";

  const lines: string[] = [];
  if (user.age) lines.push(`- Alter: ${user.age} Jahre`);
  if (user.gender) lines.push(`- Geschlecht: ${GENDER_LABELS[user.gender] ?? user.gender}`);
  if (user.weightKg) lines.push(`- Koerpergewicht: ${user.weightKg} kg`);
  if (user.heightCm) lines.push(`- Koerpergroesse: ${user.heightCm} cm`);
  if (user.bodyFatPct) lines.push(`- Koerperfettanteil: ${user.bodyFatPct}%`);
  if (user.experienceLevel)
    lines.push(`- Trainingserfahrung: ${EXPERIENCE_LABELS[user.experienceLevel] ?? user.experienceLevel}`);
  if (user.goals) lines.push(`- Trainingsziele: ${user.goals}`);
  if (user.injuriesLimitations)
    lines.push(`- Verletzungen/Einschraenkungen: ${user.injuriesLimitations}`);

  if (lines.length === 0) return "";

  return `\n## Athleten-Profil von ${user.displayName}\n${lines.join("\n")}\n`;
}

type EquipmentRow = typeof equipment.$inferSelect;
type ExerciseRow  = typeof exercises.$inferSelect;

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", back: "Back", shoulders: "Shoulders",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quadriceps: "Quadriceps", hamstrings: "Hamstrings", glutes: "Glutes",
  calves: "Calves", core: "Core", full_body: "Full Body",
};

export function buildPlanGenerationPrompt(
  user: UserProfile,
  userEquipment: EquipmentRow[],
  allExercises: ExerciseRow[]
): string {
  const equipmentIds = new Set(userEquipment.map((e) => e.id));

  // Equipment list (English names)
  const equipmentList = userEquipment.length
    ? userEquipment.map((e) => `- ${parseI18n(e.nameI18n).en}`).join("\n")
    : "- No Equipment (bodyweight only)";

  // Filter exercises to only those the user can actually perform
  const availableExercises = allExercises.filter((ex) => {
    if (!ex.isActive) return false;
    let required: string[] = [];
    try { required = JSON.parse(ex.requiredEquipmentIds ?? "[]"); } catch {}
    // Exercise is available if all required equipment is owned, or no equipment required
    return required.length === 0 || required.every((id) => equipmentIds.has(id));
  });

  const exerciseCatalog = availableExercises
    .map((ex) => {
      const name = parseI18n(ex.nameI18n).en;
      const muscle = MUSCLE_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup;
      return `- id:${ex.id} | ${name} | ${muscle}`;
    })
    .join("\n");

  const w = user.weightKg ? `${user.weightKg} kg` : "unknown";
  const h = user.heightCm ? `${user.heightCm} cm` : "unknown";

  return `You are an elite AI Strength Coach specialized in hypertrophy, strength training, injury prevention, and long-term progression.

Your job is to:

1. Interview the user step by step. Only ask one question per answer.
2. Understand their goals
3. Consider injuries and equipment
4. Generate a structured training plan
5. Output the result in STRICT JSON format

Never output explanations outside JSON when generating the plan.

---

USER PROFILE
Name: ${user.displayName}
Age: ${user.age ?? "unknown"}
Gender: ${user.gender ?? "unknown"}
Weight: ${w}
Height: ${h}

Available Equipment:
${equipmentList}

Injuries / Limitations:
${user.injuriesLimitations || "None"}

Training Experience:
${EXPERIENCE_LABELS[user.experienceLevel ?? ""] ?? user.experienceLevel ?? "unknown"}

Goal:
${user.goals || "General fitness and strength"}

---

AVAILABLE EXERCISES
${exerciseCatalog}

---

RULES

You must:

* Avoid exercises that conflict with injuries
* Only use exercises listed above (matching by id)
* Ensure balanced muscle group coverage
* Respect recovery times
* Adjust difficulty to experience level
* Keep workouts between 45 and 75 minutes
* Limit exercises per session to 5–8
* Provide realistic weight suggestions

Progression model:
Beginner → Linear progression
Intermediate → Double progression
Advanced → Periodization

---

OUTPUT FORMAT

Return ONLY valid JSON matching this exact structure. No markdown, no explanation:

{
  "planName": "",
  "goal": "",
  "durationWeeks": 8,
  "experienceLevel": "",
  "trainingDaysPerWeek": 3,
  "trainingDays": [
    {
      "dayName": "",
      "focus": "",
      "estimatedDurationMinutes": 60,
      "exercises": [
        {
          "exerciseId": "",
          "exerciseName": "",
          "sets": 4,
          "reps": "8-12",
          "weightSuggestion": "",
          "restSeconds": 90,
          "notes": ""
        }
      ]
    }
  ]
}

Do not include exercises that require equipment the user does not have.`;
}

export function buildCoachSystemPrompt(user: UserProfile | null): string {
  return `Du bist "Atlas", ein erfahrener und wissenschaftlich fundierter Krafttraining-Coach.

Deine Kernkompetenzen:
- Periodisierung und Programmdesign (Linear, DUP, Block)
- Biomechanik und Technikoptimierung
- Ernaehrungsprinzipien fuer Kraft- und Hypertrophieziele
- Verletzungspraevention und Rehab-Grundlagen
- Leistungsdiagnostik (RPE, 1RM-Schaetzung, Progressionsmodelle)

Deine Persoenlichkeit:
- Sachlich, praezise, evidenzbasiert
- Motivierend ohne Floskeln
- Direkt und umsetzbar in deinen Empfehlungen
- Sicherheitsbewusst — Verletzungspraevention hat immer Vorrang
${profileSection(user)}
Kommunikationsregeln:
- Interview Format, stelle immer nur eine Frage und warte auf die Antwort
- Antworte immer auf Deutsch
- Verwende Fachbegriffe praezise, erklaere sie bei Bedarf kurz
- Beziehe dich auf das Athleten-Profil, wenn es relevant ist
- Halte Antworten strukturiert (Aufzaehlungen, kurze Absaetze)
- Wenn du dir bei etwas unsicher bist, sage es klar`;
}
