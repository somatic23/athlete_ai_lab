import { db } from "./index";
import { equipment, exercises, users } from "./schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { stringifyI18n } from "@/lib/utils/i18n";

const EQUIPMENT_DATA = [
  { de: "Langhantel",                   en: "Barbell",                     descDe: "Standard Olympic Langhantel, 20 kg",                                   descEn: "Standard Olympic barbell, 20 kg" },
  { de: "Kurzhanteln",                  en: "Dumbbells",                   descDe: "Verstellbare oder fixe Kurzhanteln",                                    descEn: "Adjustable or fixed dumbbells" },
  { de: "Multipresse / Smith Machine",  en: "Smith Machine",               descDe: "Gefuehrte Langhantel-Maschine",                                         descEn: "Guided barbell machine" },
  { de: "Kabelzug",                     en: "Cable Machine",               descDe: "Kabelmaschine mit verschiedenen Aufsaetzen",                           descEn: "Cable machine with various attachments" },
  { de: "Latzug-Maschine",             en: "Lat Pulldown Machine",        descDe: "Maschine fuer Latzug und Ruderübungen",                                 descEn: "Machine for lat pulldowns and rows" },
  { de: "Beinpresse",                   en: "Leg Press",                   descDe: "45-Grad Beinpresse",                                                    descEn: "45-degree leg press machine" },
  { de: "Beinstrecker",                 en: "Leg Extension Machine",       descDe: "Maschine fuer Quadrizeps-Isolation",                                    descEn: "Machine for quadriceps isolation" },
  { de: "Beinbeuger (Maschine)",        en: "Leg Curl Machine",            descDe: "Maschine fuer Hamstring-Isolation, liegend oder sitzend",              descEn: "Machine for hamstring isolation, lying or seated" },
  { de: "Butterfly / Peck Deck",        en: "Pec Deck / Butterfly",        descDe: "Maschine fuer Brust-Isolation",                                         descEn: "Machine for chest isolation" },
  { de: "Schulterpresse (Maschine)",    en: "Shoulder Press Machine",      descDe: "Gefuehrte Schulterdrück-Maschine",                                      descEn: "Guided shoulder press machine" },
  { de: "Rudermaschine",               en: "Seated Row Machine",           descDe: "Sitzende Rudermaschine (Bauchstuetze)",                                 descEn: "Seated rowing machine with chest pad" },
  { de: "Bankdrück-Bank",              en: "Flat Bench",                   descDe: "Flache oder schraege Hantelbank",                                       descEn: "Flat or incline weight bench" },
  { de: "Schraegbank",                  en: "Adjustable Incline Bench",    descDe: "Verstellbare Schraegbank (positiv/negativ)",                            descEn: "Adjustable incline bench (positive/negative)" },
  { de: "Klimmzugstange",              en: "Pull-Up Bar",                  descDe: "Stange fuer Klimmzuege, Chin-Ups",                                      descEn: "Bar for pull-ups and chin-ups" },
  { de: "Dip-Stangen",                  en: "Dip Bars",                    descDe: "Stangen fuer Dips und Koerpergewichtsuebungen",                        descEn: "Bars for dips and bodyweight exercises" },
  { de: "Kettlebell",                   en: "Kettlebell",                  descDe: "Gusseisengewicht mit Griff",                                            descEn: "Cast iron weight with handle" },
  { de: "Widerstandsbaender",           en: "Resistance Bands",            descDe: "Latex-Widerstandsbaender verschiedener Staerken",                      descEn: "Latex resistance bands of various strengths" },
  { de: "Kabelzug-Seil",               en: "Cable Rope Attachment",        descDe: "Seilaufsatz fuer Kabelzug-Maschine",                                   descEn: "Rope attachment for cable machine" },
  { de: "EZ-Stange",                   en: "EZ Curl Bar",                  descDe: "Geschwungene Stange fuer Curl-Uebungen",                               descEn: "Curved bar for curl exercises" },
  { de: "Parallelstangen",              en: "Parallel Bars",               descDe: "Parallele Stangen fuer Dips, L-Sits",                                  descEn: "Parallel bars for dips and L-sits" },
  { de: "Glute-Ham-Raise (GHR)",        en: "Glute-Ham Raise (GHR)",       descDe: "Spezialgeraet fuer hintere Kette",                                     descEn: "Specialized equipment for the posterior chain" },
  { de: "Hyperbank",                    en: "Hyperextension Bench",        descDe: "Geraet fuer Rueckenstrecker / Reverse Hyper",                          descEn: "Machine for back extensions and reverse hyper" },
  { de: "Landmine",                     en: "Landmine",                    descDe: "Langhantel-Halterung fuer Rotationsübungen",                           descEn: "Barbell holder for rotational exercises" },
  { de: "Dip-Guertel",                  en: "Dipping Belt",                descDe: "Guertel zum Aufhaengen von Gewichten",                                  descEn: "Belt for hanging weights" },
  { de: "Zugmaschine / Sled",           en: "Prowler / Sled",              descDe: "Schlitten fuer Pushing/Pulling",                                       descEn: "Sled for pushing and pulling" },
  { de: "Klimmzug-Assistenzmaschine",   en: "Assisted Pull-Up Machine",    descDe: "Maschine mit Gegengewicht fuer Klimmzug-Anfaenger",                    descEn: "Machine with counterweight for pull-up beginners" },
  { de: "Kein Equipment",               en: "No Equipment",                descDe: "Koerpergewichtsübungen ohne Equipment",                                 descEn: "Bodyweight exercises without equipment" },
];

type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps"
  | "forearms" | "quadriceps" | "hamstrings" | "glutes"
  | "calves" | "core" | "full_body";

interface ExerciseData {
  de: string;
  en: string;
  descDe: string;
  descEn: string;
  primaryMuscleGroup: MuscleGroup;
  equipment: string[]; // German equipment names used as lookup keys
}

const EXERCISES_DATA: ExerciseData[] = [
  // Brust / Chest
  {
    de: "Bankdrücken (Langhantel)", en: "Barbell Bench Press",
    descDe: "Klassische Grunduebung fuer die Brust. Langhantel wird aus dem Rack genommen und zur Brust abgesenkt.",
    descEn: "Classic compound movement for the chest. Barbell is unracked and lowered to the chest.",
    primaryMuscleGroup: "chest", equipment: ["Langhantel", "Bankdrück-Bank"],
  },
  {
    de: "Schraegbankdrücken (Langhantel)", en: "Incline Barbell Bench Press",
    descDe: "Schraegbankdrücken mit positivem Winkel (30–45 Grad) fuer die obere Brust.",
    descEn: "Incline bench press at 30–45 degrees targeting the upper chest.",
    primaryMuscleGroup: "chest", equipment: ["Langhantel", "Schraegbank"],
  },
  {
    de: "Bankdrücken (Kurzhantel)", en: "Dumbbell Bench Press",
    descDe: "Kurzhantel-Bankdrücken mit groesserer Bewegungsfreiheit.",
    descEn: "Dumbbell bench press with greater range of motion.",
    primaryMuscleGroup: "chest", equipment: ["Kurzhanteln", "Bankdrück-Bank"],
  },
  {
    de: "Kabelkreuzen", en: "Cable Crossover / Cable Fly",
    descDe: "Isolationsübung fuer die Brust am Kabelzug. Verschiedene Winkel moeglich.",
    descEn: "Chest isolation exercise on the cable machine. Various angles possible.",
    primaryMuscleGroup: "chest", equipment: ["Kabelzug"],
  },
  {
    de: "Butterfly / Peck Deck", en: "Pec Deck / Butterfly",
    descDe: "Isolationsmaschine fuer die Brustmuskeln.",
    descEn: "Isolation machine for the pectoral muscles.",
    primaryMuscleGroup: "chest", equipment: ["Butterfly / Peck Deck"],
  },
  {
    de: "Dips (Brust)", en: "Chest Dips",
    descDe: "Koerpergewicht-Dips mit vorgebeugtem Koerper fuer Brustbetonung.",
    descEn: "Bodyweight dips with a forward lean to emphasize the chest.",
    primaryMuscleGroup: "chest", equipment: ["Dip-Stangen"],
  },
  // Ruecken / Back
  {
    de: "Kreuzheben (Langhantel)", en: "Barbell Deadlift",
    descDe: "Grundlegende Compound-Uebung fuer den gesamten Koerper. Langhantel vom Boden heben.",
    descEn: "Fundamental compound movement for the whole body. Lifting the barbell from the floor.",
    primaryMuscleGroup: "back", equipment: ["Langhantel"],
  },
  {
    de: "Klimmzuege (Ueberkopfgriff)", en: "Pull-Ups (Overhand Grip)",
    descDe: "Klimmzuege mit Pronationsgriff (Haende zeigen weg). Breites Schulterblatt.",
    descEn: "Pull-ups with a pronated (overhand) grip. Wide lat engagement.",
    primaryMuscleGroup: "back", equipment: ["Klimmzugstange"],
  },
  {
    de: "Chin-Ups (Untergriff)", en: "Chin-Ups (Underhand Grip)",
    descDe: "Klimmzuege mit Supinationsgriff (Haende zeigen zum Koerper). Mehr Bizeps.",
    descEn: "Pull-ups with a supinated (underhand) grip. Greater biceps involvement.",
    primaryMuscleGroup: "back", equipment: ["Klimmzugstange"],
  },
  {
    de: "Latzug (Maschine)", en: "Lat Pulldown (Machine)",
    descDe: "Latzug-Maschine fuer breiten Ruecken. Griff breiter als Schulterbreite.",
    descEn: "Lat pulldown machine for a wide back. Grip wider than shoulder width.",
    primaryMuscleGroup: "back", equipment: ["Latzug-Maschine"],
  },
  {
    de: "Sitzrudern (Kabel)", en: "Seated Cable Row",
    descDe: "Sitzende Ruderübung am Kabelzug mit engem oder breitem Griff.",
    descEn: "Seated rowing on the cable machine with narrow or wide grip.",
    primaryMuscleGroup: "back", equipment: ["Kabelzug"],
  },
  {
    de: "Langhantelrudern", en: "Bent-Over Barbell Row",
    descDe: "Vorgebeugtes Rudern mit Langhantel. Stange zur Huefte ziehen.",
    descEn: "Bent-over rowing with a barbell. Pull the bar toward the hips.",
    primaryMuscleGroup: "back", equipment: ["Langhantel"],
  },
  {
    de: "T-Bar Rudern", en: "T-Bar Row",
    descDe: "T-Bar Rudern mit Brustauflage oder freistehend.",
    descEn: "T-bar row with chest pad support or freestanding.",
    primaryMuscleGroup: "back", equipment: ["Landmine", "Langhantel"],
  },
  // Schultern / Shoulders
  {
    de: "Militaerdrücken (Langhantel, stehend)", en: "Standing Barbell Overhead Press",
    descDe: "Langhantel wird ueber den Kopf gedrückt. Klassische Schulterpresse.",
    descEn: "Barbell pressed overhead. Classic shoulder compound movement.",
    primaryMuscleGroup: "shoulders", equipment: ["Langhantel"],
  },
  {
    de: "Schulterdrücken (Kurzhantel)", en: "Seated Dumbbell Shoulder Press",
    descDe: "Kurzhantel-Schulterdrücken sitzend fuer Schulterentwicklung.",
    descEn: "Seated dumbbell shoulder press for shoulder development.",
    primaryMuscleGroup: "shoulders", equipment: ["Kurzhanteln", "Schraegbank"],
  },
  {
    de: "Seitheben (Kurzhantel)", en: "Dumbbell Lateral Raise",
    descDe: "Seitliches Anheben der Kurzhanteln fuer mittleren Deltamuskel.",
    descEn: "Lateral dumbbell raises targeting the medial deltoid.",
    primaryMuscleGroup: "shoulders", equipment: ["Kurzhanteln"],
  },
  {
    de: "Face Pulls (Kabel)", en: "Cable Face Pulls",
    descDe: "Seilzug zur Stirn fuer hintere Schulter und externe Rotation.",
    descEn: "Rope pull to the face for rear delts and external rotation.",
    primaryMuscleGroup: "shoulders", equipment: ["Kabelzug", "Kabelzug-Seil"],
  },
  {
    de: "Frontheben (Kurzhantel)", en: "Dumbbell Front Raise",
    descDe: "Frontales Anheben der Kurzhanteln fuer vorderen Deltamuskel.",
    descEn: "Front raise with dumbbells targeting the anterior deltoid.",
    primaryMuscleGroup: "shoulders", equipment: ["Kurzhanteln"],
  },
  // Bizeps / Biceps
  {
    de: "Langhantelcurl", en: "Barbell Curl",
    descDe: "Grunduebung fuer den Bizeps. Langhantel wird zum Kinn gecurlt.",
    descEn: "Fundamental bicep exercise. Curl the barbell up toward the chin.",
    primaryMuscleGroup: "biceps", equipment: ["Langhantel"],
  },
  {
    de: "Kurzhantelcurl (alternierend)", en: "Alternating Dumbbell Curl",
    descDe: "Alternierend curlen mit Kurzhanteln, Supination im Bewegungsverlauf.",
    descEn: "Alternating dumbbell curls with supination throughout the movement.",
    primaryMuscleGroup: "biceps", equipment: ["Kurzhanteln"],
  },
  {
    de: "Hammercurls", en: "Hammer Curls",
    descDe: "Neutrale Griffhaltung beim Curlen. Trainiert Brachialis und Brachioradialis.",
    descEn: "Neutral grip curl. Trains the brachialis and brachioradialis.",
    primaryMuscleGroup: "biceps", equipment: ["Kurzhanteln"],
  },
  {
    de: "Praecherbank-Curl (EZ-Stange)", en: "Preacher Curl (EZ Bar)",
    descDe: "Curl auf der Praecherbank fuer maximale Bizeps-Isolation.",
    descEn: "Curl on the preacher bench for maximum bicep isolation.",
    primaryMuscleGroup: "biceps", equipment: ["EZ-Stange", "Bankdrück-Bank"],
  },
  {
    de: "Kabelcurl", en: "Cable Curl",
    descDe: "Curl am Kabelzug fuer konstante Spannung.",
    descEn: "Bicep curl on the cable machine for constant tension.",
    primaryMuscleGroup: "biceps", equipment: ["Kabelzug"],
  },
  // Trizeps / Triceps
  {
    de: "Trizeps-Dips", en: "Tricep Dips",
    descDe: "Koerpergewicht-Dips aufrecht fuer Trizeps-Betonung.",
    descEn: "Bodyweight dips in upright position emphasizing the triceps.",
    primaryMuscleGroup: "triceps", equipment: ["Dip-Stangen"],
  },
  {
    de: "Trizeps-Drücken (Kabelzug, Seil)", en: "Cable Rope Tricep Pushdown",
    descDe: "Seildrücken am Kabelzug fuer Trizeps-Isolation.",
    descEn: "Rope pushdown on the cable machine for tricep isolation.",
    primaryMuscleGroup: "triceps", equipment: ["Kabelzug", "Kabelzug-Seil"],
  },
  {
    de: "Franzoesisches Drücken (Langhantel)", en: "Skull Crushers (Barbell)",
    descDe: "Skull Crushers – Langhantel hinter den Kopf absenken, liegend.",
    descEn: "Skull crushers – lower the barbell behind the head while lying down.",
    primaryMuscleGroup: "triceps", equipment: ["Langhantel", "Bankdrück-Bank"],
  },
  {
    de: "Close-Grip Bankdrücken", en: "Close-Grip Bench Press",
    descDe: "Enger Griff beim Bankdrücken fuer Trizeps-Betonung.",
    descEn: "Narrow grip bench press emphasizing the triceps.",
    primaryMuscleGroup: "triceps", equipment: ["Langhantel", "Bankdrück-Bank"],
  },
  {
    de: "Kickbacks (Kurzhantel)", en: "Dumbbell Tricep Kickbacks",
    descDe: "Kurzhantel-Kickbacks fuer Trizeps-Isolation.",
    descEn: "Dumbbell kickbacks for tricep isolation.",
    primaryMuscleGroup: "triceps", equipment: ["Kurzhanteln"],
  },
  // Beine / Legs
  {
    de: "Kniebeugen (Langhantel, High-Bar)", en: "High-Bar Barbell Squat",
    descDe: "Klassische High-Bar Kniebeuge mit Langhantel auf dem Trapezmuskel.",
    descEn: "Classic high-bar squat with barbell resting on the upper traps.",
    primaryMuscleGroup: "quadriceps", equipment: ["Langhantel"],
  },
  {
    de: "Kniebeugen (Langhantel, Low-Bar)", en: "Low-Bar Barbell Squat",
    descDe: "Low-Bar Kniebeuge mit mehr Huefte und hinterer Kette.",
    descEn: "Low-bar squat with greater hip involvement and posterior chain engagement.",
    primaryMuscleGroup: "quadriceps", equipment: ["Langhantel"],
  },
  {
    de: "Frontkniebeugen", en: "Front Squat",
    descDe: "Langhantel vor der Brust, aufrechter Torso, starker Quadrizeps-Fokus.",
    descEn: "Barbell in front of the chest, upright torso, strong quadriceps focus.",
    primaryMuscleGroup: "quadriceps", equipment: ["Langhantel"],
  },
  {
    de: "Beinpresse (45 Grad)", en: "Leg Press (45°)",
    descDe: "Beinpresse an der Maschine fuer Beinentwicklung ohne Rueckbelastung.",
    descEn: "Leg press machine for leg development without spinal loading.",
    primaryMuscleGroup: "quadriceps", equipment: ["Beinpresse"],
  },
  {
    de: "Beinstrecker (Maschine)", en: "Leg Extension (Machine)",
    descDe: "Isolationsübung fuer den Quadrizeps an der Maschine.",
    descEn: "Isolation exercise for the quadriceps on the machine.",
    primaryMuscleGroup: "quadriceps", equipment: ["Beinstrecker"],
  },
  {
    de: "Rumänisches Kreuzheben", en: "Romanian Deadlift (RDL)",
    descDe: "RDL – Langhantel an den Beinen entlang absenken fuer Hamstrings.",
    descEn: "RDL – lower the barbell along the legs targeting the hamstrings.",
    primaryMuscleGroup: "hamstrings", equipment: ["Langhantel"],
  },
  {
    de: "Beinbeuger liegend (Maschine)", en: "Lying Leg Curl (Machine)",
    descDe: "Liegender Beinbeuger fuer Hamstring-Isolation.",
    descEn: "Lying leg curl machine for hamstring isolation.",
    primaryMuscleGroup: "hamstrings", equipment: ["Beinbeuger (Maschine)"],
  },
  {
    de: "Kniebeugen (Goblet)", en: "Goblet Squat",
    descDe: "Goblet Squat mit Kettlebell fuer Kniebeugentechnik und Quadrizeps.",
    descEn: "Goblet squat with kettlebell for squat technique and quadriceps.",
    primaryMuscleGroup: "quadriceps", equipment: ["Kettlebell"],
  },
  {
    de: "Hip Thrust (Langhantel)", en: "Barbell Hip Thrust",
    descDe: "Gesaess-Isolation mit Langhantel auf der Huefte. Ruecken an der Bank.",
    descEn: "Glute isolation with barbell across the hips. Back against the bench.",
    primaryMuscleGroup: "glutes", equipment: ["Langhantel", "Bankdrück-Bank"],
  },
  {
    de: "Ausfallschritte (Langhantel)", en: "Barbell Lunges",
    descDe: "Walking Lunges oder statische Ausfallschritte mit Langhantel.",
    descEn: "Walking or static lunges with a barbell.",
    primaryMuscleGroup: "quadriceps", equipment: ["Langhantel"],
  },
  {
    de: "Wadendrücken (Maschine)", en: "Calf Press (Machine)",
    descDe: "Wadendrücken an der Beinpresse fuer Gastrocnemius-Entwicklung.",
    descEn: "Calf press on the leg press machine for gastrocnemius development.",
    primaryMuscleGroup: "calves", equipment: ["Beinpresse"],
  },
  // Core
  {
    de: "Plank", en: "Plank",
    descDe: "Isometrische Core-Uebung in Unterarmstützposition.",
    descEn: "Isometric core exercise in forearm support position.",
    primaryMuscleGroup: "core", equipment: ["Kein Equipment"],
  },
  {
    de: "Hängendes Beinheben", en: "Hanging Leg Raise",
    descDe: "Haengendes Beinheben fuer untere Bauchmuskulatur.",
    descEn: "Hanging leg raise targeting the lower abdominals.",
    primaryMuscleGroup: "core", equipment: ["Klimmzugstange"],
  },
  {
    de: "Cable Crunch", en: "Cable Crunch",
    descDe: "Seilzug-Crunch fuer die Bauchmuskulatur mit Gewichtswiderstand.",
    descEn: "Weighted rope crunch for the abdominals with resistance.",
    primaryMuscleGroup: "core", equipment: ["Kabelzug", "Kabelzug-Seil"],
  },
];

async function seed() {
  console.log("Starting database seed...");

  // ===============================
  // Admin User
  // ===============================
  const adminEmail = process.env.ADMIN_EMAIL || "admin@athleteai.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin1234!";

  const existing = await db.query.users.findFirst({
    where: eq(users.email, adminEmail),
  });

  if (!existing) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await db.insert(users).values({
      id: randomUUID(),
      email: adminEmail,
      passwordHash: hash,
      displayName: "Admin",
      role: "admin",
      onboardingCompleted: true,
    });
    console.log(`Admin user created: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log("Admin user already exists, skipping.");
  }

  // ===============================
  // Equipment
  // ===============================
  const existingEquipment = await db.query.equipment.findMany();
  if (existingEquipment.length === 0) {
    const eqValues = EQUIPMENT_DATA.map((e) => ({
      id: randomUUID(),
      nameI18n: stringifyI18n({ de: e.de, en: e.en }),
      descriptionI18n: stringifyI18n({ de: e.descDe, en: e.descEn }),
      isActive: true,
    }));
    await db.insert(equipment).values(eqValues);
    console.log(`Inserted ${eqValues.length} equipment entries.`);
  } else {
    console.log(`Equipment already seeded (${existingEquipment.length} entries), skipping.`);
  }

  // ===============================
  // Exercises
  // ===============================
  const existingExercises = await db.query.exercises.findMany();
  if (existingExercises.length === 0) {
    const allEquipment = await db.query.equipment.findMany();
    // Build map from German name → id
    const eqMap = Object.fromEntries(
      allEquipment.map((e) => {
        const parsed = JSON.parse(e.nameI18n);
        return [parsed.de as string, e.id];
      })
    );

    const exValues = EXERCISES_DATA.map((ex) => {
      const requiredIds = ex.equipment.map((name) => eqMap[name]).filter(Boolean);
      return {
        id: randomUUID(),
        nameI18n: stringifyI18n({ de: ex.de, en: ex.en }),
        descriptionI18n: stringifyI18n({ de: ex.descDe, en: ex.descEn }),
        primaryMuscleGroup: ex.primaryMuscleGroup,
        requiredEquipmentIds: JSON.stringify(requiredIds),
        secondaryMuscleGroups: JSON.stringify([]),
        isActive: true,
      };
    });
    await db.insert(exercises).values(exValues);
    console.log(`Inserted ${exValues.length} exercise entries.`);
  } else {
    console.log(`Exercises already seeded (${existingExercises.length} entries), skipping.`);
  }

  console.log("Seed completed.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
