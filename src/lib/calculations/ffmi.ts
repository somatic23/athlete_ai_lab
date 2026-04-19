export interface FfmiInput {
  weightKg: number;
  heightCm: number;
  bodyFatPct: number;
}

export type FfmiCategory =
  | "below_average"
  | "average"
  | "above_average"
  | "excellent"
  | "exceptional"
  | "suspiciously_high";

export interface FfmiResult {
  leanMassKg: number;
  ffmi: number;
  ffmiNormalized: number;
  category: FfmiCategory;
}

export function calculateFfmi({ weightKg, heightCm, bodyFatPct }: FfmiInput): FfmiResult {
  const heightM = heightCm / 100;
  const leanMassKg = weightKg * (1 - bodyFatPct / 100);
  const ffmi = leanMassKg / (heightM * heightM);
  const ffmiNormalized = ffmi + 6.1 * (1.8 - heightM);

  let category: FfmiCategory;
  if (ffmiNormalized < 18) category = "below_average";
  else if (ffmiNormalized < 20) category = "average";
  else if (ffmiNormalized < 22) category = "above_average";
  else if (ffmiNormalized < 25) category = "excellent";
  else if (ffmiNormalized < 28) category = "exceptional";
  else category = "suspiciously_high";

  return { leanMassKg, ffmi, ffmiNormalized, category };
}

export const FFMI_CATEGORY_LABELS: Record<FfmiCategory, { de: string; en: string }> = {
  below_average:      { de: "Unterdurchschnittlich",   en: "Below average" },
  average:            { de: "Durchschnittlich",        en: "Average" },
  above_average:      { de: "Überdurchschnittlich",    en: "Above average" },
  excellent:          { de: "Ausgezeichnet",           en: "Excellent" },
  exceptional:        { de: "Außergewöhnlich",         en: "Exceptional" },
  suspiciously_high:  { de: "Auffällig hoch",          en: "Suspiciously high" },
};
