import type { equipment, exercises, users } from "@/db/schema";
import { parseI18n } from "@/lib/utils/i18n";
import { calculateAge } from "@/lib/utils/age";
import { getPersonality } from "@/lib/coach-personalities";
import type { CoachPersonality } from "@/lib/coach-personalities";

type UserProfile = typeof users.$inferSelect;
type EquipmentRow = typeof equipment.$inferSelect;
type ExerciseRow  = typeof exercises.$inferSelect;

const EXPERIENCE_LABELS: Record<"de" | "en", Record<string, string>> = {
  de: {
    beginner: "Anfaenger (< 1 Jahr)",
    intermediate: "Fortgeschritten (1–3 Jahre)",
    advanced: "Erfahren (3–5 Jahre)",
    expert: "Experte (5+ Jahre)",
  },
  en: {
    beginner: "Beginner (< 1 year)",
    intermediate: "Intermediate (1–3 years)",
    advanced: "Advanced (3–5 years)",
    expert: "Expert (5+ years)",
  },
};

const GENDER_LABELS: Record<"de" | "en", Record<string, string>> = {
  de: { male: "maennlich", female: "weiblich", diverse: "divers" },
  en: { male: "male", female: "female", diverse: "diverse" },
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

type Locale = "de" | "en";

const PROFILE_LABELS: Record<Locale, {
  header: (name: string) => string;
  age: string; ageUnit: string; gender: string; weight: string; height: string;
  bodyFat: string; experience: string; goals: string; injuries: string;
  equipment: string; noEquipment: string;
}> = {
  de: {
    header: (name) => `## Athleten-Profil von ${name}`,
    age: "Alter", ageUnit: "Jahre", gender: "Geschlecht",
    weight: "Koerpergewicht", height: "Koerpergroesse", bodyFat: "Koerperfettanteil",
    experience: "Trainingserfahrung", goals: "Trainingsziele",
    injuries: "Verletzungen/Einschraenkungen",
    equipment: "Verfuegbares Equipment", noEquipment: "Kein Equipment (nur Koerpergewicht)",
  },
  en: {
    header: (name) => `## Athlete Profile: ${name}`,
    age: "Age", ageUnit: "years", gender: "Gender",
    weight: "Body Weight", height: "Height", bodyFat: "Body Fat",
    experience: "Training Experience", goals: "Training Goals",
    injuries: "Injuries/Limitations",
    equipment: "Available Equipment", noEquipment: "No equipment (bodyweight only)",
  },
};

function profileSection(user: UserProfile | null, userEquipment?: EquipmentRow[], locale: Locale = "de"): string {
  if (!user) return "";
  const L = PROFILE_LABELS[locale];
  const G = GENDER_LABELS[locale];
  const E = EXPERIENCE_LABELS[locale];

  const lines: string[] = [];
  const age = calculateAge(user.birthDate);
  if (age) lines.push(`- ${L.age}: ${age} ${L.ageUnit}`);
  if (user.gender) lines.push(`- ${L.gender}: ${G[user.gender] ?? user.gender}`);
  if (user.weightKg) lines.push(`- ${L.weight}: ${user.weightKg} kg`);
  if (user.heightCm) lines.push(`- ${L.height}: ${user.heightCm} cm`);
  if (user.bodyFatPct) lines.push(`- ${L.bodyFat}: ${user.bodyFatPct}%`);
  if (user.experienceLevel)
    lines.push(`- ${L.experience}: ${E[user.experienceLevel] ?? user.experienceLevel}`);
  if (user.goals) lines.push(`- ${L.goals}: ${user.goals}`);
  if (user.injuriesLimitations)
    lines.push(`- ${L.injuries}: ${user.injuriesLimitations}`);
  if (userEquipment && userEquipment.length > 0) {
    const names = userEquipment
      .map((e) => (locale === "de" ? parseI18n(e.nameI18n).de : parseI18n(e.nameI18n).en) || parseI18n(e.nameI18n).de || parseI18n(e.nameI18n).en)
      .filter(Boolean);
    lines.push(`- ${L.equipment}: ${names.join(", ")}`);
  } else if (userEquipment) {
    lines.push(`- ${L.equipment}: ${L.noEquipment}`);
  }

  if (lines.length === 0) return "";
  return `\n${L.header(user.displayName)}\n${lines.join("\n")}\n`;
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

// ── Post-workout analysis system prompt ───────────────────────────────

export function buildAnalysisSystemPrompt(locale: Locale = "de"): string {
  if (locale === "en") {
    return `You are Atlas, a science-based strength training coach.
Analyze the workout session and provide structured feedback in English. Be precise and actionable.
Respond ONLY with a JSON object.`;
  }
  return `Du bist Atlas, ein wissenschaftlich fundierter Krafttraining-Coach.
Analysiere die Trainingseinheit und liefere strukturiertes Feedback auf Deutsch. Sei präzise und umsetzbar.
Antworte NUR mit einem JSON-Objekt.`;
}

export function buildAnalysisUserPrompt(
  title: string,
  durationSeconds: number,
  totalVolumeKg: number,
  totalSets: number,
  totalReps: number,
  sessionRpeAvg: number | null,
  perceivedLoad: string | null | undefined,
  satisfactionRating: number | null | undefined,
  feedbackText: string | null | undefined,
  muscleGroupsTrained: string[],
  exerciseContext: string,
  locale: Locale = "de"
): string {
  if (locale === "en") {
    return `WORKOUT: ${title}
Duration: ${Math.round(durationSeconds / 60)} min | Volume: ${totalVolumeKg.toFixed(1)} kg | Sets: ${totalSets} | Reps: ${totalReps}
${sessionRpeAvg != null ? `Avg RPE: ${sessionRpeAvg.toFixed(1)}` : ""}
${perceivedLoad ? `Perceived load: ${perceivedLoad}` : ""}
${satisfactionRating ? `Satisfaction: ${satisfactionRating}/5` : ""}
${feedbackText ? `Feedback: ${feedbackText}` : ""}

Muscle groups: ${muscleGroupsTrained.join(", ")}

Exercises:
${exerciseContext}

Generate an analysis with highlights, warnings, recommendations, plateauDetectedExercises, overloadDetectedMuscles, recoveryEstimates (muscle→hours), nextSessionSuggestions.`;
  }

  const LOAD_LABELS_DE: Record<string, string> = {
    light: "leicht", moderate: "moderat", heavy: "schwer",
    very_heavy: "sehr schwer", maximal: "maximal",
  };

  return `TRAINING: ${title}
Dauer: ${Math.round(durationSeconds / 60)} min | Volumen: ${totalVolumeKg.toFixed(1)} kg | Sätze: ${totalSets} | Wdh: ${totalReps}
${sessionRpeAvg != null ? `⌀ RPE: ${sessionRpeAvg.toFixed(1)}` : ""}
${perceivedLoad ? `Belastung: ${LOAD_LABELS_DE[perceivedLoad] ?? perceivedLoad}` : ""}
${satisfactionRating ? `Zufriedenheit: ${satisfactionRating}/5` : ""}
${feedbackText ? `Feedback: ${feedbackText}` : ""}

Muskelgruppen: ${muscleGroupsTrained.join(", ")}

Übungen:
${exerciseContext}

Erstelle eine Analyse mit highlights, warnings, recommendations, plateauDetectedExercises, overloadDetectedMuscles, recoveryEstimates (Muskel→Stunden), nextSessionSuggestions.`;
}

// ── Weekly / Monthly analysis prompts ────────────────────────────────

export function buildPeriodAnalysisSystemPrompt(
  type: "weekly" | "monthly",
  locale: Locale = "de"
): string {
  if (locale === "en") {
    const period = type === "weekly" ? "week" : "month";
    return `You are Atlas, a science-based strength training coach.
Analyze the athlete's training data for the past ${period} and provide a structured summary.
Focus on: total load, muscle group balance, progression trends, recovery risks, and actionable recommendations for next ${period}.
Respond ONLY with a JSON object.`;
  }
  const period = type === "weekly" ? "Woche" : "Monat";
  return `Du bist Atlas, ein wissenschaftlich fundierter Krafttraining-Coach.
Analysiere die Trainingsdaten des Athleten für die vergangene ${period} und liefere eine strukturierte Zusammenfassung.
Fokus: Gesamtbelastung, Muskelgruppen-Balance, Progressionstrends, Recovery-Risiken, umsetzbare Empfehlungen für die nächste ${period}.
Antworte NUR mit einem JSON-Objekt.`;
}

type SessionSummaryForPrompt = {
  title: string;
  date: string;
  durationMin: number;
  totalVolumeKg: number;
  totalSets: number;
  perceivedLoad: string | null;
  satisfactionRating: number | null;
  muscleGroups: string[];
  exercises: { name: string; volumeKg: number; maxWeightKg: number; estimated1rm: number | null }[];
};

export function buildPeriodAnalysisUserPrompt(
  type: "weekly" | "monthly",
  sessions: SessionSummaryForPrompt[],
  muscleVolumeMap: Record<string, number>,
  existingWarnings: string[],
  locale: Locale = "de"
): string {
  const totalVol = sessions.reduce((a, s) => a + s.totalVolumeKg, 0);
  const totalSets = sessions.reduce((a, s) => a + s.totalSets, 0);

  const sessionLines = sessions.map((s) => {
    const ex = s.exercises.map((e) =>
      `    • ${e.name}: ${e.volumeKg.toFixed(0)} kg vol${e.estimated1rm ? `, est. 1RM ${e.estimated1rm.toFixed(1)} kg` : ""}`
    ).join("\n");
    return `  ${s.date} — ${s.title} (${s.durationMin} min, ${s.totalVolumeKg.toFixed(0)} kg)\n${ex}`;
  }).join("\n");

  const muscleLines = Object.entries(muscleVolumeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([m, v]) => `  ${m}: ${v.toFixed(0)} kg`)
    .join("\n");

  if (locale === "en") {
    const period = type === "weekly" ? "Weekly" : "Monthly";
    return `${period.toUpperCase()} TRAINING SUMMARY
Sessions: ${sessions.length} | Total Volume: ${totalVol.toFixed(0)} kg | Total Sets: ${totalSets}

SESSIONS
${sessionLines || "  (none)"}

VOLUME BY MUSCLE GROUP
${muscleLines || "  (none)"}

${existingWarnings.length > 0 ? `ACTIVE WARNINGS FROM POST-WORKOUT ANALYSES\n${existingWarnings.map((w) => `  ⚠ ${w}`).join("\n")}\n` : ""}
Generate an analysis with highlights, warnings, recommendations, plateauDetectedExercises, overloadDetectedMuscles, recoveryEstimates (muscle→hours), nextSessionSuggestions.`;
  }

  const period = type === "weekly" ? "Wochenanalyse" : "Monatsanalyse";
  return `${period.toUpperCase()}
Einheiten: ${sessions.length} | Gesamtvolumen: ${totalVol.toFixed(0)} kg | Gesamtsätze: ${totalSets}

EINHEITEN
${sessionLines || "  (keine)"}

VOLUMEN NACH MUSKELGRUPPE
${muscleLines || "  (keine)"}

${existingWarnings.length > 0 ? `AKTIVE WARNUNGEN AUS POST-WORKOUT-ANALYSEN\n${existingWarnings.map((w) => `  ⚠ ${w}`).join("\n")}\n` : ""}
Erstelle eine Analyse mit highlights, warnings, recommendations, plateauDetectedExercises, overloadDetectedMuscles, recoveryEstimates (Muskel→Stunden), nextSessionSuggestions.`;
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

const COMPETENCIES: Record<Locale, string> = {
  de: `Deine Kernkompetenzen:
- Periodisierung und Programmdesign (Linear, DUP, Block)
- Biomechanik und Technikoptimierung
- Ernaehrungsprinzipien fuer Kraft- und Hypertrophieziele
- Verletzungspraevention und Rehab-Grundlagen
- Maximierung der Cardio-Vaskulären Ausdauer
- Leistungsdiagnostik (RPE, 1RM-Schaetzung, Progressionsmodelle)`,
  en: `Your core competencies:
- Periodization and program design (Linear, DUP, Block)
- Biomechanics and technique optimization
- Nutrition principles for strength and hypertrophy goals
- Injury prevention and rehabilitation basics
- Maximising the cardio-vascular performance
- Performance diagnostics (RPE, 1RM estimation, progression models)`,
};

const CATALOG_HEADER: Record<Locale, string> = {
  de: `Übungskatalog (nutze ausschließlich diese Übungen und referenziere sie mit der exakten ID)`,
  en: `Exercise Catalog (use ONLY these exercises, reference by exact ID)`,
};

const COMM_RULES_BASE: Record<Locale, string> = {
  de: `Kommunikationsregeln:
- Interview Format, stelle immer nur eine Frage und warte auf die Antwort
- Verwende Fachbegriffe praezise, erklaere sie bei Bedarf kurz
- Beziehe dich auf das Athleten-Profil, wenn es relevant ist
- Halte Antworten kurz und strukturiert (Aufzaehlungen, kurze Absaetze)
- Wenn du dir bei etwas unsicher bist, sage es klar`,
  en: `Communication rules:
- Interview format: ask only one question at a time and wait for the answer
- Use technical terms precisely, explain briefly when needed
- Reference the athlete profile when relevant
- Keep answers short and structured (bullet points, short paragraphs)
- If you are unsure about something, state it clearly`,
};

export function buildCoachSystemPrompt(
  user: UserProfile | null,
  userEquipment?: EquipmentRow[],
  allExercises?: ExerciseRow[],
  locale: Locale = "de",
  personality?: CoachPersonality | null
): string {
  const p = getPersonality(personality ?? (user?.coachPersonality as CoachPersonality | undefined));



  return `${p.intro[locale]}

${COMPETENCIES[locale]}
${p.personalityBlock[locale]}

${COMM_RULES_BASE[locale]}
${p.commStyle[locale]}`;
}
// ${profileSection(user, userEquipment, locale)}${catalogSection}
// ── Plan creation (interview + tool call) system prompt ────────────────

const PLAN_CREATION_RULES: Record<Locale, string> = {
  de: `Ablauf der Planerstellung (streng einhalten!):

WICHTIG — Interview-Phase zuerst:
- In deiner ERSTEN Antwort rufst du KEIN Tool auf. Begruesse kurz und stelle die erste Frage.
- Frage immer nur EINE Frage pro Antwort, warte auf die Antwort.
- Erst nachdem du konkrete Antworten zu mindestens diesen Punkten hast, darfst du das Tool aufrufen:
  1. Aktuelles Trainingsziel (falls Profilziel nicht mehr passt)
  2. Verfuegbare Trainingstage pro Woche (Zahl)
  3. Gewuenschte Session-Dauer
  4. Aktuelle Verletzungen/Einschraenkungen
  5. Vorlieben (Grundübungen vs. Maschinen o.ae.)
- Rufe niemals das Tool auf, wenn der Athlet nur schreibt "Ich moechte einen Plan erstellen" — frage dann erst nach.

Tool-Aufruf (proposeTrainingPlan):
- Schreibe den Plan NIE als Text oder JSON. Nutze ausschliesslich das Tool.
- Nutze NUR Uebungen aus dem Uebungskatalog oben, referenziert mit der exakten ID.
- trainingDaysPerWeek ist eine ZAHL (z.B. 3).
- trainingDays ist eine Liste von OBJEKTEN (nicht Wochentagsnamen!). Jedes Objekt hat dayName, focus, estimatedDurationMinutes und exercises[].
- Jedes Exercise-Objekt: exerciseId (aus Katalog), exerciseName, sets, reps (z.B. "8-12"), weightSuggestion (z.B. "60 kg" oder "Koerpergewicht"), restSeconds, notes.
- Laenge von trainingDays MUSS gleich trainingDaysPerWeek sein.
- 45–75 Minuten pro Einheit, 5–8 Uebungen pro Tag, realistische Gewichte passend zum Erfahrungslevel.
- Progression: Anfaenger → linear, Fortgeschritten → Double Progression, Erfahren → Periodisierung.
- coachNotes: 2–5 kurze Saetze mit Design-Entscheidungen und Hinweisen.

Nach dem Tool-Aufruf:
- Schreibe keinen weiteren Text — der Plan wird dem Athleten grafisch angezeigt.
- Wenn der Athlet Anpassungen wuenscht: nimm sie auf, stelle ggf. Rueckfragen und rufe das Tool erneut mit dem aktualisierten kompletten Plan auf.`,
  en: `Plan creation workflow (strict):

IMPORTANT — interview phase first:
- In your FIRST reply, do NOT call any tool. Greet briefly and ask the first question.
- Ask ONE question per reply and wait for the answer.
- Only after you have explicit answers to at least these items may you call the tool:
  1. Current training goal (if the profile goal no longer fits)
  2. Available training days per week (number)
  3. Desired session duration
  4. Current injuries / limitations
  5. Preferences (compound lifts vs. machines, etc.)
- Never call the tool when the athlete just says "I'd like to create a plan" — ask follow-up questions first.

Tool call (proposeTrainingPlan):
- NEVER write the plan as text or JSON. Always use the tool.
- Use ONLY exercises from the catalog above, referenced by exact ID.
- trainingDaysPerWeek is a NUMBER (e.g. 3).
- trainingDays is a list of OBJECTS (NOT weekday names!). Each object has dayName, focus, estimatedDurationMinutes, and exercises[].
- Each exercise object: exerciseId (from catalog), exerciseName, sets, reps (e.g. "8-12"), weightSuggestion (e.g. "60 kg" or "Bodyweight"), restSeconds, notes.
- trainingDays length MUST equal trainingDaysPerWeek.
- 45–75 minutes per session, 5–8 exercises per day, realistic weights matching the experience level.
- Progression: Beginner → linear, Intermediate → double progression, Advanced → periodization.
- coachNotes: 2–5 short sentences with design choices and cues.

After the tool call:
- Do not write any further text — the plan is rendered graphically for the athlete.
- If the athlete requests changes: acknowledge, ask follow-up questions if needed, then call the tool again with the fully updated plan.`,
};

export function buildPlanCreationSystemPrompt(
  user: UserProfile | null,
  userEquipment?: EquipmentRow[],
  allExercises?: ExerciseRow[],
  locale: Locale = "de",
  personality?: CoachPersonality | null
): string {
  const p = getPersonality(personality ?? (user?.coachPersonality as CoachPersonality | undefined));

  const exerciseCatalog =
    userEquipment && allExercises
      ? buildExerciseCatalog(userEquipment, allExercises, locale)
      : "";

  const catalogSection = exerciseCatalog
    ? `\n${CATALOG_HEADER[locale]}\n${exerciseCatalog}\n`
    : "";

  return `${p.intro[locale]}

${COMPETENCIES[locale]}

${p.personalityBlock[locale]}
${profileSection(user, userEquipment, locale)}${catalogSection}
${COMM_RULES_BASE[locale]}
${p.commStyle[locale]}

${PLAN_CREATION_RULES[locale]}`;
}
