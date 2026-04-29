export type CurrentExercise = {
  exerciseId: string;
  exerciseName: string;
  primaryMuscleGroup: string;
  sets: number;
  repsMin: number;
  repsMax: number | null;
  suggestedWeightKg: number | null;
  notes: string | null;
};

export type EngineDecisionForPrompt = {
  exerciseId: string;
  exerciseName: string;
  changeType: "progression" | "deload" | "maintenance" | "recovery";
  fromSets: number;
  fromRepsMin: number;
  fromRepsMax: number | null;
  fromWeightKg: number | null;
  toSets: number;
  toRepsMin: number;
  toRepsMax: number | null;
  toWeightKg: number | null;
  reasonKey: string;
  reasonInputs: Record<string, string | number>;
};

export type RecentPerformance = {
  exerciseId: string;
  sessionDate: string;
  maxWeightKg: number | null;
  totalReps: number | null;
  avgRpe: number | null;
  estimated1rm: number | null;
  performanceDeltaPct: number | null;
};

export type RecoveryStatus = {
  muscleGroup: string;
  fullyRecoveredAt: string | null;
};

export function buildCoachingSuggestionSystemPrompt(locale: "de" | "en"): string {
  if (locale === "en") {
    return `You are Atlas, an expert AI strength coach. The training adjustments for the next session have ALREADY been calculated by a deterministic engine — your job is ONLY to write the natural-language justification in the coach's voice.

Rules:
- Do NOT propose new numbers. Use exactly the sets/reps/weights given.
- For each exercise, write a 1-2 sentence \`changeReason\` that references the actual reason (RPE, plateau, recovery, etc.).
- Optionally add a brief \`notes\` line if the athlete should pay attention to something (form cue, tempo, etc.). Empty string is fine.
- Write a short overall \`rationale\` (2-3 sentences) summarising the day.

Respond ONLY with a valid JSON object matching the schema. No prose, no markdown, no code fences.`;
  }

  return `Du bist Atlas, ein erfahrener KI-Krafttrainer. Die Trainingsanpassungen für die nächste Einheit wurden BEREITS von einer deterministischen Engine berechnet — deine Aufgabe ist NUR, die Begründung in der Coach-Stimme zu formulieren.

Regeln:
- Schlage KEINE neuen Zahlen vor. Verwende exakt die gegebenen Sätze/Wiederholungen/Gewichte.
- Für jede Übung 1–2 Sätze \`changeReason\`, der den tatsächlichen Auslöser (RPE, Plateau, Erholung, etc.) referenziert.
- Optional eine kurze \`notes\`-Zeile, wenn der Athlet auf etwas achten sollte (Technik, Tempo). Leerer String ist okay.
- Schreibe eine kurze \`rationale\` (2–3 Sätze) als Tageszusammenfassung.

Antworte NUR mit einem gültigen JSON-Objekt gemäß Schema. Kein Text, kein Markdown, keine Code-Blöcke.`;
}

export function buildCoachingSuggestionUserPrompt(
  dayTitle: string,
  dayFocus: string | null,
  currentExercises: CurrentExercise[],
  recentPerformance: RecentPerformance[],
  recoveryStatus: RecoveryStatus[],
  locale: "de" | "en"
): string {
  const now = new Date().toISOString().slice(0, 10);

  const perfByExercise = new Map<string, RecentPerformance[]>();
  for (const p of recentPerformance) {
    if (!perfByExercise.has(p.exerciseId)) perfByExercise.set(p.exerciseId, []);
    perfByExercise.get(p.exerciseId)!.push(p);
  }

  const exerciseLines = currentExercises.map((ex) => {
    const weightStr = ex.suggestedWeightKg != null ? `${ex.suggestedWeightKg} kg` : (locale === "en" ? "no weight set" : "kein Gewicht gesetzt");
    const repsStr = ex.repsMax != null ? `${ex.repsMin}–${ex.repsMax}` : `${ex.repsMin}`;
    const planLine = locale === "en"
      ? `  Current plan: ${ex.sets} sets × ${repsStr} reps, ${weightStr}`
      : `  Aktueller Plan: ${ex.sets} Sätze × ${repsStr} Wdh, ${weightStr}`;

    const sessions = perfByExercise.get(ex.exerciseId) ?? [];
    let perfLines = "";
    if (sessions.length === 0) {
      perfLines = locale === "en" ? "  No recent data" : "  Keine aktuellen Daten";
    } else {
      const label = locale === "en" ? "Last sessions" : "Letzte Einheiten";
      perfLines = `  ${label}:\n` + sessions.map((s) => {
        const delta = s.performanceDeltaPct != null ? `, Δ${s.performanceDeltaPct > 0 ? "+" : ""}${s.performanceDeltaPct.toFixed(1)}%` : "";
        const e1rm = s.estimated1rm != null ? `, est. 1RM ${s.estimated1rm.toFixed(1)} kg` : "";
        const rpe = s.avgRpe != null ? `, RPE ${s.avgRpe.toFixed(1)}` : "";
        const reps = s.totalReps != null ? `, ${s.totalReps} reps` : "";
        const weight = s.maxWeightKg != null ? `, max ${s.maxWeightKg} kg` : "";
        return `    - ${s.sessionDate}${weight}${reps}${rpe}${e1rm}${delta}`;
      }).join("\n");
    }

    return `[exerciseId:${ex.exerciseId}] ${ex.exerciseName} (${ex.primaryMuscleGroup})\n${planLine}\n${perfLines}`;
  }).join("\n\n");

  const recoveryLines = recoveryStatus.map((r) => {
    if (r.fullyRecoveredAt == null) return `  - ${r.muscleGroup}: ${locale === "en" ? "fully recovered" : "vollständig erholt"}`;
    const recovAt = r.fullyRecoveredAt.slice(0, 10);
    if (recovAt <= now) return `  - ${r.muscleGroup}: ${locale === "en" ? "fully recovered" : "vollständig erholt"}`;
    return locale === "en"
      ? `  - ${r.muscleGroup}: still recovering (expected: ${r.fullyRecoveredAt.slice(0, 16)})`
      : `  - ${r.muscleGroup}: noch in Erholung (erwartet: ${r.fullyRecoveredAt.slice(0, 16)})`;
  }).join("\n");

  const schemaExample = `{
  "exercises": [
    {
      "exerciseId": "...",
      "exerciseName": "...",
      "sets": 4,
      "repsMin": 8,
      "repsMax": 12,
      "suggestedWeightKg": 80.0,
      "notes": "...",
      "changeType": "progression",
      "changeReason": "..."
    }
  ],
  "rationale": "..."
}`;

  if (locale === "en") {
    return `TRAINING DAY: ${dayTitle}${dayFocus ? ` (Focus: ${dayFocus})` : ""}

EXERCISES AND RECENT PERFORMANCE DATA
${exerciseLines}

RECOVERY STATUS
${recoveryLines || "  No recovery data available"}

TASK: Create adjustments for each exercise. Use ONLY the exerciseIds listed above (do not invent new IDs). Use changeType="maintenance" when no change is needed. Weight steps: ±2.5–5 kg compound, ±1.25–2.5 kg isolation.

OUTPUT JSON SCHEMA (respond with this exact structure):
${schemaExample}`;
  }

  return `TRAININGSTAG: ${dayTitle}${dayFocus ? ` (Fokus: ${dayFocus})` : ""}

ÜBUNGEN UND LETZTE LEISTUNGSDATEN
${exerciseLines}

ERHOLUNGSSTATUS
${recoveryLines || "  Keine Erholungsdaten verfügbar"}

AUFGABE: Erstelle Anpassungen für jede Übung. Verwende NUR die oben aufgelisteten exerciseIds (keine neuen IDs erfinden). Verwende changeType="maintenance" wenn keine Änderung nötig. Gewichtsschritte: ±2,5–5 kg Grundübungen, ±1,25–2,5 kg Isolation.

OUTPUT JSON SCHEMA (antworte mit genau dieser Struktur):
${schemaExample}`;
}

/**
 * Builds the user prompt for the LLM when the deterministic engine has already
 * decided the numbers. The LLM only needs to produce per-exercise changeReason +
 * optional notes + an overall rationale, in the coach's voice.
 */
export function buildReasoningUserPrompt(
  dayTitle: string,
  dayFocus: string | null,
  decisions: EngineDecisionForPrompt[],
  locale: "de" | "en",
): string {
  const fmt = (w: number | null) => w == null ? (locale === "en" ? "—" : "—") : `${w} kg`;
  const reps = (mn: number, mx: number | null) => mx == null ? `${mn}` : `${mn}–${mx}`;

  const lines = decisions.map((d) => {
    const inputs = Object.entries(d.reasonInputs)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    if (locale === "en") {
      return `[exerciseId:${d.exerciseId}] ${d.exerciseName}
  changeType: ${d.changeType}
  reasonKey: ${d.reasonKey}${inputs ? ` (${inputs})` : ""}
  from: ${d.fromSets} sets × ${reps(d.fromRepsMin, d.fromRepsMax)} reps, ${fmt(d.fromWeightKg)}
  to:   ${d.toSets} sets × ${reps(d.toRepsMin, d.toRepsMax)} reps, ${fmt(d.toWeightKg)}`;
    }
    return `[exerciseId:${d.exerciseId}] ${d.exerciseName}
  changeType: ${d.changeType}
  reasonKey: ${d.reasonKey}${inputs ? ` (${inputs})` : ""}
  von: ${d.fromSets} Sätze × ${reps(d.fromRepsMin, d.fromRepsMax)} Wdh, ${fmt(d.fromWeightKg)}
  zu:  ${d.toSets} Sätze × ${reps(d.toRepsMin, d.toRepsMax)} Wdh, ${fmt(d.toWeightKg)}`;
  }).join("\n\n");

  const schemaExample = `{
  "exercises": [
    { "exerciseId": "...", "changeReason": "...", "notes": "" }
  ],
  "rationale": "..."
}`;

  if (locale === "en") {
    return `TRAINING DAY: ${dayTitle}${dayFocus ? ` (Focus: ${dayFocus})` : ""}

DECISIONS (already final — DO NOT change the numbers)
${lines}

TASK: For each exerciseId, write a 1-2 sentence \`changeReason\` that explains WHY this change happened in the coach's voice. Optionally add a brief \`notes\` (form cue, focus). Then write a 2-3 sentence overall \`rationale\` for the session.

OUTPUT JSON SCHEMA (respond with this exact structure):
${schemaExample}`;
  }

  return `TRAININGSTAG: ${dayTitle}${dayFocus ? ` (Fokus: ${dayFocus})` : ""}

ENTSCHEIDUNGEN (final — Zahlen NICHT verändern)
${lines}

AUFGABE: Schreibe pro exerciseId einen \`changeReason\` (1–2 Sätze) der erklärt, WARUM die Anpassung passiert (Coach-Stimme). Optional eine kurze \`notes\`-Zeile (Technik, Fokus). Dann eine \`rationale\` (2–3 Sätze) für den Gesamttag.

OUTPUT JSON SCHEMA (antworte mit genau dieser Struktur):
${schemaExample}`;
}
