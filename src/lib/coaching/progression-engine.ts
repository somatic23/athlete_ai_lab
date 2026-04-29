export type ProgressionInputs = {
  exercise: {
    id: string;
    primaryMuscleGroup: string;
    isCompound: boolean;
  };
  current: {
    sets: number;
    repsMin: number;
    repsMax: number | null;
    suggestedWeightKg: number | null;
  };
  history: {
    sessionDate: string;
    maxWeightKg: number | null;
    totalReps: number | null;
    avgRpe: number | null;
    estimated1rm: number | null;
    performanceDeltaPct: number | null;
  }[];
  recovery: {
    fullyRecoveredAt: string | null;
  };
  trend: {
    direction: "up" | "plateau" | "down" | null;
    weeksInTrend: number | null;
  };
  /** Override "now" for deterministic tests. */
  nowIso?: string;
};

export type ChangeType = "progression" | "deload" | "maintenance" | "recovery";

export type ProgressionDecision = {
  changeType: ChangeType;
  sets: number;
  repsMin: number;
  repsMax: number | null;
  suggestedWeightKg: number | null;
  reasonKey: ReasonKey;
  reasonInputs: Record<string, string | number>;
};

export type ReasonKey =
  | "muscle_unrecovered"
  | "rpe_too_high"
  | "performance_dropped"
  | "trend_down"
  | "plateau_3_weeks"
  | "rpe_low_full_reps"
  | "rep_progression"
  | "no_history"
  | "optimal";

const COMPOUND_KEYWORDS = [
  "squat", "kniebeuge", "deadlift", "kreuzheben",
  "bench", "bankdr", "press", "drücken", "drucken",
  "row", "rudern", "pull", "klimm",
  "clean", "umsetz", "snatch", "reissen", "reißen",
];

/** Heuristic: classify by name keyword or full_body muscle group. */
export function isCompoundExercise(name: string, primaryMuscleGroup: string): boolean {
  if (primaryMuscleGroup === "full_body") return true;
  const lower = name.toLowerCase();
  return COMPOUND_KEYWORDS.some((kw) => lower.includes(kw));
}

const COMPOUND_STEP_KG = 5.0;
const ISOLATION_STEP_KG = 2.5;
const DELOAD_FACTOR = 0.85;
const PLATEAU_DELOAD_FACTOR = 0.9;
const RPE_DELOAD_THRESHOLD = 9.0;
const RPE_PROGRESSION_THRESHOLD = 7.0;
const RPE_REP_PROGRESSION_THRESHOLD = 8.0;
const PERF_DROP_PCT_DELOAD = -5.0;

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Pure decision function. No I/O, no LLM. Determines the next session's
 * sets/reps/weight from recent history and trend signals. The reasonKey is
 * passed to a downstream LLM (or fallback i18n map) for natural-language
 * justification.
 */
export function decide(inputs: ProgressionInputs): ProgressionDecision {
  const { exercise, current, history, recovery, trend } = inputs;
  const now = inputs.nowIso ? new Date(inputs.nowIso) : new Date();

  const step = exercise.isCompound ? COMPOUND_STEP_KG : ISOLATION_STEP_KG;
  const baseDecision = {
    sets: current.sets,
    repsMin: current.repsMin,
    repsMax: current.repsMax,
    suggestedWeightKg: current.suggestedWeightKg,
  };

  // Rule 1: Recovery — muscle group still recovering takes precedence
  if (recovery.fullyRecoveredAt) {
    const recoveredAt = new Date(recovery.fullyRecoveredAt);
    if (recoveredAt > now) {
      return {
        changeType: "recovery",
        ...baseDecision,
        sets: Math.max(2, current.sets - 1),
        reasonKey: "muscle_unrecovered",
        reasonInputs: {
          muscleGroup: exercise.primaryMuscleGroup,
          recoveredAt: recovery.fullyRecoveredAt.slice(0, 16),
        },
      };
    }
  }

  // No history → maintenance
  if (history.length === 0) {
    return {
      changeType: "maintenance",
      ...baseDecision,
      reasonKey: "no_history",
      reasonInputs: {},
    };
  }

  const last = history[0];

  // Rule 2: Deload triggers
  if (last.avgRpe != null && last.avgRpe >= RPE_DELOAD_THRESHOLD) {
    const newWeight = current.suggestedWeightKg
      ? roundToStep(current.suggestedWeightKg * DELOAD_FACTOR, step)
      : current.suggestedWeightKg;
    return {
      changeType: "deload",
      ...baseDecision,
      suggestedWeightKg: newWeight,
      reasonKey: "rpe_too_high",
      reasonInputs: { rpe: last.avgRpe.toFixed(1) },
    };
  }

  if (last.performanceDeltaPct != null && last.performanceDeltaPct <= PERF_DROP_PCT_DELOAD) {
    const newWeight = current.suggestedWeightKg
      ? roundToStep(current.suggestedWeightKg * DELOAD_FACTOR, step)
      : current.suggestedWeightKg;
    return {
      changeType: "deload",
      ...baseDecision,
      suggestedWeightKg: newWeight,
      reasonKey: "performance_dropped",
      reasonInputs: { deltaPct: last.performanceDeltaPct.toFixed(1) },
    };
  }

  if (trend.direction === "down" && (trend.weeksInTrend ?? 0) >= 2) {
    const newWeight = current.suggestedWeightKg
      ? roundToStep(current.suggestedWeightKg * DELOAD_FACTOR, step)
      : current.suggestedWeightKg;
    return {
      changeType: "deload",
      ...baseDecision,
      suggestedWeightKg: newWeight,
      reasonKey: "trend_down",
      reasonInputs: { weeks: trend.weeksInTrend ?? 2 },
    };
  }

  // Rule 3: Plateau-deload after 3 weeks
  if (trend.direction === "plateau" && (trend.weeksInTrend ?? 0) >= 3) {
    const newWeight = current.suggestedWeightKg
      ? roundToStep(current.suggestedWeightKg * PLATEAU_DELOAD_FACTOR, step)
      : current.suggestedWeightKg;
    return {
      changeType: "deload",
      ...baseDecision,
      suggestedWeightKg: newWeight,
      reasonKey: "plateau_3_weeks",
      reasonInputs: { weeks: trend.weeksInTrend ?? 3 },
    };
  }

  const targetReps = current.repsMax ?? current.repsMin;
  const fullSetReps = current.sets * targetReps;
  const minPlusOneReps = current.sets * (current.repsMin + 1);

  // Rule 4: Weight progression — easy session, all reps completed
  if (
    last.avgRpe != null &&
    last.avgRpe <= RPE_PROGRESSION_THRESHOLD &&
    last.totalReps != null &&
    last.totalReps >= fullSetReps &&
    current.suggestedWeightKg != null
  ) {
    return {
      changeType: "progression",
      ...baseDecision,
      suggestedWeightKg: roundToStep(current.suggestedWeightKg + step, step),
      reasonKey: "rpe_low_full_reps",
      reasonInputs: {
        rpe: last.avgRpe.toFixed(1),
        step: step.toFixed(1),
      },
    };
  }

  // Rule 5: Rep progression — moderate RPE, beat the rep floor
  if (
    last.avgRpe != null &&
    last.avgRpe <= RPE_REP_PROGRESSION_THRESHOLD &&
    last.totalReps != null &&
    last.totalReps >= minPlusOneReps &&
    current.repsMax != null &&
    current.repsMin < current.repsMax
  ) {
    return {
      changeType: "progression",
      ...baseDecision,
      repsMin: Math.min(current.repsMin + 1, current.repsMax),
      reasonKey: "rep_progression",
      reasonInputs: { rpe: last.avgRpe.toFixed(1) },
    };
  }

  // Rule 6: Maintenance
  return {
    changeType: "maintenance",
    ...baseDecision,
    reasonKey: "optimal",
    reasonInputs: {},
  };
}

/** German fallback strings keyed by reasonKey. Used when LLM is unavailable. */
export const REASON_TEMPLATES_DE: Record<ReasonKey, string> = {
  muscle_unrecovered: "Muskelgruppe {muscleGroup} ist noch nicht erholt — reduzierter Umfang bis {recoveredAt}.",
  rpe_too_high: "Letzter RPE bei {rpe} — Deload empfohlen, um Übertraining zu vermeiden.",
  performance_dropped: "Leistung um {deltaPct}% gesunken — kontrollierter Deload.",
  trend_down: "Trend zeigt seit {weeks} Wochen abwärts — Deload, um Erholung zu erzwingen.",
  plateau_3_weeks: "Seit {weeks} Wochen stagniert das e1RM — Deload-Woche bricht das Plateau.",
  rpe_low_full_reps: "Letzte Einheit mit RPE {rpe} und allen Wiederholungen — Gewicht +{step} kg.",
  rep_progression: "RPE {rpe} und Wiederholungen über Mindestbereich — eine Wiederholung mehr anpeilen.",
  no_history: "Keine Vergangenheitsdaten — Plan wie geplant ausführen.",
  optimal: "Aktuelle Vorgaben passen — beibehalten.",
};

export const REASON_TEMPLATES_EN: Record<ReasonKey, string> = {
  muscle_unrecovered: "Muscle group {muscleGroup} is still recovering — reduce volume until {recoveredAt}.",
  rpe_too_high: "Last session RPE was {rpe} — deload recommended to prevent overreaching.",
  performance_dropped: "Performance dropped by {deltaPct}% — controlled deload.",
  trend_down: "Trend has been down for {weeks} weeks — deload to force recovery.",
  plateau_3_weeks: "e1RM has plateaued for {weeks} weeks — deload week breaks the plateau.",
  rpe_low_full_reps: "Last session RPE {rpe} with all reps — add {step} kg.",
  rep_progression: "RPE {rpe} and reps above the minimum — target one more rep.",
  no_history: "No history available — execute the plan as scheduled.",
  optimal: "Current prescription fits — maintain.",
};

export function renderReason(
  key: ReasonKey,
  inputs: Record<string, string | number>,
  locale: "de" | "en",
): string {
  const tpl = (locale === "en" ? REASON_TEMPLATES_EN : REASON_TEMPLATES_DE)[key];
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(inputs[k] ?? ""));
}
