export const EQUIPMENT_CATEGORIES = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable_machine",
  "machine",
  "bodyweight",
  "resistance_band",
  "cardio",
  "accessories",
  "other",
] as const;

export type EquipmentCategory = typeof EQUIPMENT_CATEGORIES[number];

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, { de: string; en: string }> = {
  barbell:         { de: "Langhantel",      en: "Barbell" },
  dumbbell:        { de: "Kurzhantel",      en: "Dumbbell" },
  kettlebell:      { de: "Kettlebell",      en: "Kettlebell" },
  cable_machine:   { de: "Kabelzug",        en: "Cable Machine" },
  machine:         { de: "Maschine",        en: "Machine" },
  bodyweight:      { de: "Körpergewicht",   en: "Bodyweight" },
  resistance_band: { de: "Widerstandsband", en: "Resistance Band" },
  cardio:          { de: "Cardio",          en: "Cardio" },
  accessories:     { de: "Zubehör",         en: "Accessories" },
  other:           { de: "Sonstiges",       en: "Other" },
};
