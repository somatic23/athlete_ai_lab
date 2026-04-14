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
    return `You are Atlas, an expert AI strength coach. Analyze the athlete's recent performance data and create concrete adjustments for their next training day.

Apply progressive overload principles:
- Increase weight by 2.5–5 kg for compound movements (squat, deadlift, bench, row, press) when RPE ≤ 7 and all reps completed
- Increase weight by 1.25–2.5 kg for isolation exercises under the same conditions
- Suggest deload (reduce weight 10–20% or reduce sets) if RPE ≥ 9 or performance dropped
- Suggest recovery (reduce volume, keep weight) if muscle group is not fully recovered
- Use maintenance if no data is available or performance is optimal

Respond ONLY with a valid JSON object matching the exact schema below. No prose, no markdown, no code fences.`;
  }

  return `Du bist Atlas, ein erfahrener KI-Krafttrainer. Analysiere die letzten Leistungsdaten des Athleten und erstelle konkrete Anpassungen für den nächsten Trainingstag.

Wende progressive Überlastungsprinzipien an:
- Gewicht um 2,5–5 kg erhöhen bei Grundübungen (Kniebeuge, Kreuzheben, Bankdrücken, Rudern, Drücken) wenn RPE ≤ 7 und alle Wiederholungen geschafft
- Gewicht um 1,25–2,5 kg erhöhen bei Isolationsübungen unter gleichen Bedingungen
- Deload vorschlagen (Gewicht 10–20% reduzieren oder Sätze reduzieren) wenn RPE ≥ 9 oder Leistung gesunken
- Recovery vorschlagen (Volumen reduzieren, Gewicht halten) wenn Muskelgruppe noch nicht vollständig erholt
- Maintenance wenn keine Daten vorhanden oder Leistung optimal

Antworte NUR mit einem gültigen JSON-Objekt gemäß dem exakten Schema unten. Kein Text, kein Markdown, keine Code-Blöcke.`;
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
