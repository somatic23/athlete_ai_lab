/**
 * Epley formula with optional RPE → RIR adjustment.
 *
 * A 5-rep set at RPE 7 (3 reps in reserve) is a much stronger signal of true
 * 1RM than a 5-rep set at RPE 10 (failure). When RPE is provided, effective
 * reps = reps + RIR, where RIR = clamp(10 - rpe, 0, 5). The cap at 5 prevents
 * extrapolating wildly from very easy sets.
 *
 * Without an RPE the function falls back to plain Epley, preserving prior
 * behaviour for call sites that don't track RPE.
 */
export function estimated1rm(weightKg: number, reps: number, rpe?: number | null): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  const rir = rpe != null ? Math.min(5, Math.max(0, 10 - rpe)) : 0;
  const effectiveReps = reps + rir;
  if (effectiveReps <= 1) return weightKg;
  return Math.round(weightKg * (1 + effectiveReps / 30) * 10) / 10;
}

/** Format kg value — drops decimals when whole number */
export function fmtKg(kg: number | null | undefined): string {
  if (kg == null) return "—";
  return kg % 1 === 0 ? `${kg} kg` : `${kg.toFixed(1)} kg`;
}
