import { db } from "./index";
import { equipment, exercises, users } from "./schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const EQUIPMENT_DATA = [
  { name: "Langhantel", description: "Standard Olympic Barbell, 20kg" },
  { name: "Kurzhanteln", description: "Verstellbare oder fixe Kurzhanteln" },
  { name: "Multipresse / Smith Machine", description: "Gefuehrte Langhantel-Maschine" },
  { name: "Kabelzug", description: "Kabelmaschine mit verschiedenen Aufsaetzen" },
  { name: "Latzug-Maschine", description: "Maschine fuer Latzug und Ruderübungen" },
  { name: "Beinpresse", description: "45-Grad Beinpresse" },
  { name: "Beinstrecker", description: "Maschine fuer Quadrizeps-Isolation" },
  { name: "Beinbeuger (Maschine)", description: "Maschine fuer Hamstring-Isolation, liegend oder sitzend" },
  { name: "Butterfly / Peck Deck", description: "Maschine fuer Brust-Isolation" },
  { name: "Schulterpresse (Maschine)", description: "Gefuehrte Schulterdrück-Maschine" },
  { name: "Rudermaschine", description: "Sitzende Rudermaschine (Bauchstuetze)" },
  { name: "Bankdrück-Bank", description: "Flache oder schraege Hantelbank" },
  { name: "Schraeabank", description: "Verstellbare Schraegbank (positiv/negativ)" },
  { name: "Klimmzugstange", description: "Stange fuer Klimmzuege, Chin-Ups" },
  { name: "Dip-Stangen", description: "Stangen fuer Dips und Koerpergewichtsuebungen" },
  { name: "Kettlebell", description: "Gusseisengewicht mit Griff" },
  { name: "Widerstandsbaender", description: "Latex-Widerstandsbaender verschiedener Staerken" },
  { name: "Kabelzug-Seil", description: "Seilaufsatz fuer Kabelzug-Maschine" },
  { name: "EZ-Stange", description: "Geschwungene Stange fuer Curl-Uebungen" },
  { name: "Parallelstangen", description: "Parallele Stangen fuer Dips, L-Sits" },
  { name: "Glute-Ham-Raise (GHR)", description: "Spezialgeraet fuer hintere Kette" },
  { name: "Hyperbankuebung", description: "Geraet fuer Rueckenstrecker / Reverse Hyper" },
  { name: "Landmine", description: "Langhantel-Halterung fuer Rotationsübungen" },
  { name: "Dip-Guertel", description: "Guertel zum Aufhaengen von Gewichten" },
  { name: "Zugmaschine / Sled", description: "Schlitten fuer Pushing/Pulling" },
  { name: "Klimmzug-Assistenzmaschine", description: "Maschine mit Gegengewicht fuer Klimmzug-Anfaenger" },
  { name: "Kein Equipment", description: "Koerpergewichtsübungen ohne Equipment" },
];

const EXERCISES_DATA = [
  // Brust
  { name: "Bankdrücken (Langhantel)", primaryMuscleGroup: "chest" as const, equipment: ["Langhantel", "Bankdrück-Bank"], desc: "Klassische Grunduebung fuer die Brust. Langhantel wird aus dem Rack genommen und zur Brust abgesenkt." },
  { name: "Schraegbankdrücken (Langhantel)", primaryMuscleGroup: "chest" as const, equipment: ["Langhantel", "Schraeabank"], desc: "Schraegbankdrücken mit positivem Winkel (30-45 Grad) fuer obere Brust." },
  { name: "Bankdrücken (Kurzhantel)", primaryMuscleGroup: "chest" as const, equipment: ["Kurzhanteln", "Bankdrück-Bank"], desc: "Kurzhantel-Bankdrücken mit groesserer Bewegungsfreiheit." },
  { name: "Kabelkreuzen", primaryMuscleGroup: "chest" as const, equipment: ["Kabelzug"], desc: "Isolationsübung fuer die Brust am Kabelzug. Verschiedene Winkel moeglich." },
  { name: "Butterfly / Peck Deck", primaryMuscleGroup: "chest" as const, equipment: ["Butterfly / Peck Deck"], desc: "Isolationsmaschine fuer die Brustmuskeln." },
  { name: "Dips (Brust)", primaryMuscleGroup: "chest" as const, equipment: ["Dip-Stangen"], desc: "Koerpergewicht-Dips mit vorgebeugtem Koerper fuer Brustbetonung." },
  // Ruecken
  { name: "Kreuzheben (Langhantel)", primaryMuscleGroup: "back" as const, equipment: ["Langhantel"], desc: "Grundlegende Compound-Uebung fuer den gesamten Koerper. Langhantel vom Boden heben." },
  { name: "Klimmzuege (Ueberkopfgriff)", primaryMuscleGroup: "back" as const, equipment: ["Klimmzugstange"], desc: "Klimmzuege mit Pronate Grip (Haende zeigen weg). Breites Schulterblatt." },
  { name: "Chin-Ups (Untergriff)", primaryMuscleGroup: "back" as const, equipment: ["Klimmzugstange"], desc: "Klimmzuege mit Supinate Grip (Haende zeigen zum Koerper). Mehr Bizeps." },
  { name: "Latzug (Maschine)", primaryMuscleGroup: "back" as const, equipment: ["Latzug-Maschine"], desc: "Latzug-Maschine fuer breiten Ruecken. Griff breiter als Schulterbreite." },
  { name: "Sitzrudern (Kabel)", primaryMuscleGroup: "back" as const, equipment: ["Kabelzug"], desc: "Sitzende Ruderübung am Kabelzug mit engem oder breitem Griff." },
  { name: "Langhantelrudern", primaryMuscleGroup: "back" as const, equipment: ["Langhantel"], desc: "Vorgebeugtes Rudern mit Langhantel. Zieht Stange zur Huefte." },
  { name: "T-Bar Rudern", primaryMuscleGroup: "back" as const, equipment: ["Landmine", "Langhantel"], desc: "T-Bar Rudern mit Brustauflage oder freistehend." },
  // Schultern
  { name: "Militaerdrücken (Langhantel, stehend)", primaryMuscleGroup: "shoulders" as const, equipment: ["Langhantel"], desc: "Langhantel wird ueber den Kopf gedrückt. Klassische Schulterpresse." },
  { name: "Schulterdrücken (Kurzhantel)", primaryMuscleGroup: "shoulders" as const, equipment: ["Kurzhanteln", "Schraeabank"], desc: "Kurzhantel-Schulterdrücken sitzend fuer Schulterentwicklung." },
  { name: "Seitheben (Kurzhantel)", primaryMuscleGroup: "shoulders" as const, equipment: ["Kurzhanteln"], desc: "Seitliches Anheben der Kurzhanteln fuer mittleren Deltamuskel." },
  { name: "Face Pulls (Kabel)", primaryMuscleGroup: "shoulders" as const, equipment: ["Kabelzug", "Kabelzug-Seil"], desc: "Seilzug zur Stirn fuer hintere Schulter und externe Rotation." },
  { name: "Frontheben (Kurzhantel)", primaryMuscleGroup: "shoulders" as const, equipment: ["Kurzhanteln"], desc: "Frontales Anheben der Kurzhanteln fuer vorderen Deltamuskel." },
  // Bizeps
  { name: "Langhantelcurl", primaryMuscleGroup: "biceps" as const, equipment: ["Langhantel"], desc: "Grunduebung fuer den Bizeps. Langhantel wird zum Kinn gecurlt." },
  { name: "Kurzhantelcurl (alternierend)", primaryMuscleGroup: "biceps" as const, equipment: ["Kurzhanteln"], desc: "Alternierend curlen mit Kurzhanteln, Supination im Bewegungsverlauf." },
  { name: "Hammercurls", primaryMuscleGroup: "biceps" as const, equipment: ["Kurzhanteln"], desc: "Neutrale Griffhaltung beim Curlen. Trainiert Brachialis und Brachioradialis." },
  { name: "Praecherbank-Curl (EZ-Stange)", primaryMuscleGroup: "biceps" as const, equipment: ["EZ-Stange", "Bankdrück-Bank"], desc: "Curl auf der Praecherbank fuer maximale Bizeps-Isolation." },
  { name: "Kabelcurl", primaryMuscleGroup: "biceps" as const, equipment: ["Kabelzug"], desc: "Curl am Kabelzug fuer konstante Spannung." },
  // Trizeps
  { name: "Trizeps-Dips", primaryMuscleGroup: "triceps" as const, equipment: ["Dip-Stangen"], desc: "Koerpergewicht-Dips aufrecht fuer Trizeps-Betonung." },
  { name: "Trizeps-Drücken (Kabelzug, Seil)", primaryMuscleGroup: "triceps" as const, equipment: ["Kabelzug", "Kabelzug-Seil"], desc: "Seildrücken am Kabelzug fuer Trizeps-Isolation." },
  { name: "Franzoesisches Drücken (Langhantel)", primaryMuscleGroup: "triceps" as const, equipment: ["Langhantel", "Bankdrück-Bank"], desc: "Skull Crushers - Langhantel hinter den Kopf absenken liegend." },
  { name: "Close-Grip Bankdrücken", primaryMuscleGroup: "triceps" as const, equipment: ["Langhantel", "Bankdrück-Bank"], desc: "Enger Griff beim Bankdrücken fuer Trizeps-Betonung." },
  { name: "Kickbacks (Kurzhantel)", primaryMuscleGroup: "triceps" as const, equipment: ["Kurzhanteln"], desc: "Kurzhantel-Kickbacks fuer Trizeps-Isolation." },
  // Beine
  { name: "Kniebeugen (Langhantel, High-Bar)", primaryMuscleGroup: "quadriceps" as const, equipment: ["Langhantel"], desc: "Klassische High-Bar Kniebeuge mit Langhantel auf dem Trapezemuskel." },
  { name: "Kniebeugen (Langhantel, Low-Bar)", primaryMuscleGroup: "quadriceps" as const, equipment: ["Langhantel"], desc: "Low-Bar Kniebeuge mit mehr Huefte und hinterer Kette." },
  { name: "Frontkniebeugen", primaryMuscleGroup: "quadriceps" as const, equipment: ["Langhantel"], desc: "Langhantel vor der Brust, aufrechter Torso, starker Quadrizeps-Fokus." },
  { name: "Beinpresse (45 Grad)", primaryMuscleGroup: "quadriceps" as const, equipment: ["Beinpresse"], desc: "Beinpresse an der Maschine fuer Beinentwicklung ohne Rueckbelastung." },
  { name: "Beinstrecker (Maschine)", primaryMuscleGroup: "quadriceps" as const, equipment: ["Beinstrecker"], desc: "Isolationsübung fuer den Quadrizeps an der Maschine." },
  { name: "Rumänisches Kreuzheben", primaryMuscleGroup: "hamstrings" as const, equipment: ["Langhantel"], desc: "RDL - Langhantel an den Beinen entlang absenken fuer Hamstrings." },
  { name: "Beinbeuger liegend (Maschine)", primaryMuscleGroup: "hamstrings" as const, equipment: ["Beinbeuger (Maschine)"], desc: "Liegender Beinbeuger fuer Hamstring-Isolation." },
  { name: "Kniebeugen (Goblet)", primaryMuscleGroup: "quadriceps" as const, equipment: ["Kettlebell"], desc: "Goblet Squat mit Kettlebell fuer Kniebeugentechnik und Quadrizeps." },
  { name: "Hip Thrust (Langhantel)", primaryMuscleGroup: "glutes" as const, equipment: ["Langhantel", "Bankdrück-Bank"], desc: "Gesaess-Isolation mit Langhantel auf dem Huefte. Ruecken an der Bank." },
  { name: "Ausfallschritte (Langhantel)", primaryMuscleGroup: "quadriceps" as const, equipment: ["Langhantel"], desc: "Walking Lunges oder statische Ausfallschritte mit Langhantel." },
  { name: "Wadendrücken (Maschine)", primaryMuscleGroup: "calves" as const, equipment: ["Beinpresse"], desc: "Wadendrücken an der Beinpresse fuer Gastrocnemius-Entwicklung." },
  // Core
  { name: "Plank", primaryMuscleGroup: "core" as const, equipment: ["Kein Equipment"], desc: "Isometrische Core-Uebung in Unterarmstützposition." },
  { name: "Hängendes Beinheben", primaryMuscleGroup: "core" as const, equipment: ["Klimmzugstange"], desc: "Haengendes Beinheben fuer untere Bauchmuskulatur." },
  { name: "Cable Crunch", primaryMuscleGroup: "core" as const, equipment: ["Kabelzug", "Kabelzug-Seil"], desc: "Seilzug-Crunch fuer die Bauchmuskulatur mit Gewichtswiderstand." },
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
      name: e.name,
      description: e.description,
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
    const eqMap = Object.fromEntries(allEquipment.map((e) => [e.name, e.id]));

    const exValues = EXERCISES_DATA.map((ex) => {
      const requiredIds = ex.equipment
        .map((name) => eqMap[name])
        .filter(Boolean);
      return {
        id: randomUUID(),
        name: ex.name,
        primaryMuscleGroup: ex.primaryMuscleGroup,
        description: ex.desc,
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
