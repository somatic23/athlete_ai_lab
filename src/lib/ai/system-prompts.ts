import type { equipment, exercises, users } from "@/db/schema";
import { parseI18n } from "@/lib/utils/i18n";
import { calculateAge } from "@/lib/utils/age";

type UserProfile = typeof users.$inferSelect;
type EquipmentRow = typeof equipment.$inferSelect;
type ExerciseRow  = typeof exercises.$inferSelect;

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

const MUSCLE_LABELS_DE: Record<string, string> = {
  chest: "Brust", back: "Ruecken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesaess",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

const MUSCLE_LABELS_EN: Record<string, string> = {
  chest: "Chest", back: "Back", shoulders: "Shoulders",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quadriceps: "Quadriceps", hamstrings: "Hamstrings", glutes: "Glutes",
  calves: "Calves", core: "Core", full_body: "Full Body",
};

// ── Shared helpers ─────────────────────────────────────────────────────

function profileSection(user: UserProfile | null, userEquipment?: EquipmentRow[]): string {
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
  if (userEquipment && userEquipment.length > 0) {
    const names = userEquipment.map((e) => parseI18n(e.nameI18n).de || parseI18n(e.nameI18n).en).filter(Boolean);
    lines.push(`- Verfuegbares Equipment: ${names.join(", ")}`);
  } else if (userEquipment) {
    lines.push(`- Verfuegbares Equipment: Kein Equipment (nur Koerpergewicht)`);
  }

  if (lines.length === 0) return "";

  return `\n## Athleten-Profil von ${user.displayName}\n${lines.join("\n")}\n`;
}

/**
 * Builds a filtered exercise catalog string.
 * Only includes exercises whose required equipment the user actually has.
 */
function buildExerciseCatalog(
  userEquipment: EquipmentRow[],
  allExercises: ExerciseRow[],
  locale: "de" | "en" = "de"
): string {
  const equipmentIds = new Set(userEquipment.map((e) => e.id));
  const muscleLabels = locale === "de" ? MUSCLE_LABELS_DE : MUSCLE_LABELS_EN;

  const available = allExercises.filter((ex) => {
    if (!ex.isActive) return false;
    let required: string[] = [];
    try { required = JSON.parse(ex.requiredEquipmentIds ?? "[]"); } catch {}
    return required.length === 0 || required.every((id) => equipmentIds.has(id));
  });

  if (available.length === 0) return "- (keine Übungen verfügbar)";

  return available
    .map((ex) => {
      const names = parseI18n(ex.nameI18n);
      const name = locale === "de" ? (names.de || names.en) : (names.en || names.de);
      const muscle = muscleLabels[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup;
      return `- id:${ex.id} | ${name} | ${muscle}`;
    })
    .join("\n");
}

// ── Plan generation prompt ─────────────────────────────────────────────

export function buildPlanGenerationPrompt(
  user: UserProfile,
  userEquipment: EquipmentRow[],
  allExercises: ExerciseRow[]
): string {
  const equipmentList = userEquipment.length
    ? userEquipment.map((e) => `- ${parseI18n(e.nameI18n).en}`).join("\n")
    : "- No Equipment (bodyweight only)";

  const exerciseCatalog = buildExerciseCatalog(userEquipment, allExercises, "en");

  const athleteProfile = profileSection(user, userEquipment)
    .replace(/\n## Athleten-Profil von .+\n/, "\nATHLETE PROFILE\n");

  return `You are an elite AI Strength Coach. Generate a complete, structured training plan for the athlete described below.

Output ONLY the JSON object — no explanation, no markdown, no preamble.

---
${athleteProfile}
AVAILABLE EQUIPMENT (for exercise selection context)
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

/**
 * Final user message appended to the chat history to trigger JSON output.
 * Used when the user clicks "Plan generieren" after chatting with Atlas.
 */
export function buildPlanJsonRequest(): string {
  return `Generiere jetzt den vollständigen Trainingsplan als JSON-Objekt basierend auf unserem Gespräch. Verwende ausschließlich Übungen aus dem Übungskatalog und referenziere sie mit der exakten ID. Gib NUR das JSON-Objekt aus — keine Erklärungen, kein Markdown, keine Einleitung.

OUTPUT SCHEMA (alle Felder befüllen, keine nulls):
{
  "planName": "beschreibender Planname",
  "goal": "primäres Trainingsziel",
  "durationWeeks": 8,
  "experienceLevel": "beginner|intermediate|advanced|expert",
  "trainingDaysPerWeek": 3,
  "trainingDays": [
    {
      "dayName": "Tag A – Brust & Trizeps",
      "focus": "Brust, Trizeps",
      "estimatedDurationMinutes": 60,
      "exercises": [
        {
          "exerciseId": "<exakte ID aus dem Übungskatalog>",
          "exerciseName": "<Übungsname>",
          "sets": 4,
          "reps": "8-12",
          "weightSuggestion": "60 kg",
          "restSeconds": 90,
          "notes": ""
        }
      ]
    }
  ]
}`;
}

// ── Coach system prompt ────────────────────────────────────────────────

export function buildCoachSystemPrompt(
  user: UserProfile | null,
  userEquipment?: EquipmentRow[],
  allExercises?: ExerciseRow[]
): string {
  const exerciseCatalog =
    userEquipment && allExercises
      ? buildExerciseCatalog(userEquipment, allExercises, "de")
      : "";

  const catalogSection = exerciseCatalog
    ? `\nÜbungskatalog (nutze ausschließlich diese Übungen und referenziere sie mit der exakten ID)\n${exerciseCatalog}\n`
    : "";

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
${profileSection(user, userEquipment)}${catalogSection}
Kommunikationsregeln:
- Interview Format, stelle immer nur eine Frage und warte auf die Antwort
- Antworte immer auf Deutsch
- Verwende Fachbegriffe praezise, erklaere sie bei Bedarf kurz
- Beziehe dich auf das Athleten-Profil, wenn es relevant ist
- Halte Antworten strukturiert (Aufzaehlungen, kurze Absaetze)
- Frage zuerst, ob die übermittelten Angaben aus dem Profil (vor allem das Trainingsziel) noch aktuell sind
- Wenn du dir bei etwas unsicher bist, sage es klar`;
}
