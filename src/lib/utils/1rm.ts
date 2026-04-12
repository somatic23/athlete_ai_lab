/** Epley formula: estimated 1RM from a working set */
export function estimated1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** Format kg value — drops decimals when whole number */
export function fmtKg(kg: number | null | undefined): string {
  if (kg == null) return "—";
  return kg % 1 === 0 ? `${kg} kg` : `${kg.toFixed(1)} kg`;
}
