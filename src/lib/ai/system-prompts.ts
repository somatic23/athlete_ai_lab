import type { equipment, exercises, users } from "@/db/schema";
import { parseI18n } from "@/lib/utils/i18n";
import { calculateAge } from "@/lib/utils/age";

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
  const age = calculateAge(user.birthDate);
  if (age) lines.push(`- Alter: ${age} Jahre`);
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
  const age = calculateAge(user.birthDate);

  return `You are an elite AI Strength Coach. Generate a complete, structured training plan for the athlete described below.

Output ONLY the JSON object — no explanation, no markdown, no preamble.

---

ATHLETE PROFILE
Name: ${user.displayName}
Age: ${age ?? "unknown"}
Gender: ${user.gender ?? "unknown"}
Weight: ${w}
Height: ${h}
Experience: ${EXPERIENCE_LABELS[user.experienceLevel ?? ""] ?? user.experienceLevel ?? "unknown"}
Goal: ${user.goals || "General fitness and strength"}
Injuries / Limitations: ${user.injuriesLimitations || "None"}

AVAILABLE EQUIPMENT
${equipmentList}

---

EXERCISE CATALOG (use ONLY these exercises, reference by exact id)
${exerciseCatalog}

---

RULES
- Only use exercises from the catalog above (match by id field)
- Do not include exercises that require equipment the athlete does not have
- Avoid exercises that conflict with injuries or limitations
- Balance muscle group coverage across the week
- Adjust volume and intensity to the athlete's experience level
- Keep each session 45–75 minutes, 5–8 exercises per session
- Provide realistic weight suggestions based on experience level
- Progression: Beginner → linear, Intermediate → double progression, Advanced → periodization

---

OUTPUT SCHEMA (fill every field, no nulls)

{
  "planName": "descriptive plan name",
  "goal": "primary training goal",
  "durationWeeks": 8,
  "experienceLevel": "beginner|intermediate|advanced|expert",
  "trainingDaysPerWeek": 3,
  "trainingDays": [
    {
      "dayName": "Day A – Chest & Triceps",
      "focus": "Chest, Triceps",
      "estimatedDurationMinutes": 60,
      "exercises": [
        {
          "exerciseId": "<exact id from catalog>",
          "exerciseName": "<exercise name>",
          "sets": 4,
          "reps": "8-12",
          "weightSuggestion": "60 kg",
          "restSeconds": 90,
          "notes": "technique cue or empty string"
        }
      ]
    }
  ]
}`;
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
