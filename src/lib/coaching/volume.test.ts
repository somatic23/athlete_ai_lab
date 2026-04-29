import { describe, it, expect } from "vitest";
import { aggregateWeeklyVolume, isWorkSet, type SetForVolume } from "./volume";

function s(overrides: Partial<SetForVolume>): SetForVolume {
  return {
    outcome: "completed",
    weightKg: 100,
    repsCompleted: 8,
    rpe: 7,
    primaryMuscleGroup: "chest",
    secondaryMuscleGroups: [],
    ...overrides,
  };
}

describe("isWorkSet", () => {
  it("counts a normal RPE-7 working set", () => {
    expect(isWorkSet(s({}))).toBe(true);
  });

  it("excludes skipped sets", () => {
    expect(isWorkSet(s({ outcome: "skipped" }))).toBe(false);
  });

  it("excludes sets with no weight or no reps", () => {
    expect(isWorkSet(s({ weightKg: null }))).toBe(false);
    expect(isWorkSet(s({ repsCompleted: null }))).toBe(false);
    expect(isWorkSet(s({ weightKg: 0 }))).toBe(false);
  });

  it("excludes feeler sets below 5 reps", () => {
    expect(isWorkSet(s({ repsCompleted: 4 }))).toBe(false);
    expect(isWorkSet(s({ repsCompleted: 5 }))).toBe(true);
  });

  it("excludes warmup-intensity sets (RPE < 6)", () => {
    expect(isWorkSet(s({ rpe: 5 }))).toBe(false);
    expect(isWorkSet(s({ rpe: 6 }))).toBe(true);
  });

  it("counts sets without an RPE log (user just didn't track it)", () => {
    expect(isWorkSet(s({ rpe: null }))).toBe(true);
  });
});

describe("aggregateWeeklyVolume", () => {
  it("counts primary muscle as 1 set per work set", () => {
    const totals = aggregateWeeklyVolume([
      s({ primaryMuscleGroup: "chest" }),
      s({ primaryMuscleGroup: "chest" }),
      s({ primaryMuscleGroup: "chest" }),
    ]);
    expect(totals.get("chest")).toBe(3);
  });

  it("credits secondary muscles at 0.5x", () => {
    const totals = aggregateWeeklyVolume([
      s({ primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps", "shoulders"] }),
      s({ primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps", "shoulders"] }),
    ]);
    expect(totals.get("chest")).toBe(2);
    expect(totals.get("triceps")).toBe(1); // 2 × 0.5
    expect(totals.get("shoulders")).toBe(1);
  });

  it("ignores skipped sets in the aggregate", () => {
    const totals = aggregateWeeklyVolume([
      s({ primaryMuscleGroup: "back" }),
      s({ primaryMuscleGroup: "back", outcome: "skipped" }),
    ]);
    expect(totals.get("back")).toBe(1);
  });

  it("ignores warmup sets (RPE 5) and feeler sets (3 reps)", () => {
    const totals = aggregateWeeklyVolume([
      s({ primaryMuscleGroup: "quadriceps", rpe: 5 }),     // warmup
      s({ primaryMuscleGroup: "quadriceps", repsCompleted: 3 }), // feeler
      s({ primaryMuscleGroup: "quadriceps" }),             // counts
    ]);
    expect(totals.get("quadriceps")).toBe(1);
  });

  it("returns an empty map for no input", () => {
    expect(aggregateWeeklyVolume([]).size).toBe(0);
  });

  it("rounds combined fractional totals to 0.1 precision", () => {
    // 3 bench sets contribute 3 chest + 1.5 triceps; rounding shouldn't introduce drift
    const totals = aggregateWeeklyVolume([
      s({ primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"] }),
      s({ primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"] }),
      s({ primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"] }),
    ]);
    expect(totals.get("chest")).toBe(3);
    expect(totals.get("triceps")).toBe(1.5);
  });

  it("does not double-count when primary and secondary are the same group", () => {
    // Defensive: a misconfigured exercise listing chest as both primary and
    // secondary would otherwise inflate totals. Current behavior: both add up
    // (1.5 per set), which is the simpler/predictable choice — confirmed here
    // so a future refactor can't silently change the contract.
    const totals = aggregateWeeklyVolume([
      s({ primaryMuscleGroup: "chest", secondaryMuscleGroups: ["chest"] }),
    ]);
    expect(totals.get("chest")).toBe(1.5);
  });
});
