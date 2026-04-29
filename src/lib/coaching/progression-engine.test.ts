import { describe, it, expect } from "vitest";
import { decide, isCompoundExercise, renderReason, type ProgressionInputs } from "./progression-engine";

const NOW = "2026-04-28T10:00:00.000Z";

function baseInputs(overrides: Partial<ProgressionInputs> = {}): ProgressionInputs {
  return {
    exercise: { id: "ex1", primaryMuscleGroup: "chest", isCompound: true },
    current: { sets: 4, repsMin: 8, repsMax: 12, suggestedWeightKg: 100 },
    history: [],
    recovery: { fullyRecoveredAt: null },
    trend: { direction: null, weeksInTrend: null },
    nowIso: NOW,
    ...overrides,
  };
}

describe("isCompoundExercise", () => {
  it("matches German and English keywords", () => {
    expect(isCompoundExercise("Back Squat", "quadriceps")).toBe(true);
    expect(isCompoundExercise("Kniebeuge", "quadriceps")).toBe(true);
    expect(isCompoundExercise("Bicep Curl", "biceps")).toBe(false);
    expect(isCompoundExercise("Lateral Raise", "shoulders")).toBe(false);
  });

  it("treats full_body as compound regardless of name", () => {
    expect(isCompoundExercise("Mystery Movement", "full_body")).toBe(true);
  });
});

describe("decide", () => {
  it("returns recovery when muscle group not yet recovered", () => {
    const future = "2026-04-29T08:00:00.000Z";
    const d = decide(baseInputs({
      recovery: { fullyRecoveredAt: future },
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 48, avgRpe: 7,
                  estimated1rm: 130, performanceDeltaPct: 1 }],
    }));
    expect(d.changeType).toBe("recovery");
    expect(d.reasonKey).toBe("muscle_unrecovered");
    expect(d.sets).toBe(3);
    expect(d.suggestedWeightKg).toBe(100);
  });

  it("recovery overrides plateau and progression signals", () => {
    const future = "2026-04-29T08:00:00.000Z";
    const d = decide(baseInputs({
      recovery: { fullyRecoveredAt: future },
      trend: { direction: "plateau", weeksInTrend: 5 },
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 48, avgRpe: 6,
                  estimated1rm: 130, performanceDeltaPct: 1 }],
    }));
    expect(d.changeType).toBe("recovery");
  });

  it("triggers deload on RPE >= 9", () => {
    const d = decide(baseInputs({
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 32, avgRpe: 9.2,
                  estimated1rm: 125, performanceDeltaPct: -1 }],
    }));
    expect(d.changeType).toBe("deload");
    expect(d.reasonKey).toBe("rpe_too_high");
    expect(d.suggestedWeightKg).toBe(85); // 100 * 0.85, rounded to 5 (compound)
  });

  it("triggers deload on >5% performance drop", () => {
    const d = decide(baseInputs({
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 32, avgRpe: 7.5,
                  estimated1rm: 120, performanceDeltaPct: -7.0 }],
    }));
    expect(d.changeType).toBe("deload");
    expect(d.reasonKey).toBe("performance_dropped");
  });

  it("triggers plateau-deload after 3 stagnant weeks", () => {
    const d = decide(baseInputs({
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 32, avgRpe: 7,
                  estimated1rm: 130, performanceDeltaPct: 0.2 }],
      trend: { direction: "plateau", weeksInTrend: 3 },
    }));
    expect(d.changeType).toBe("deload");
    expect(d.reasonKey).toBe("plateau_3_weeks");
    expect(d.suggestedWeightKg).toBe(90); // 100 * 0.9, step 5
  });

  it("does NOT trigger plateau deload at week 2", () => {
    const d = decide(baseInputs({
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 32, avgRpe: 7,
                  estimated1rm: 130, performanceDeltaPct: 0.2 }],
      trend: { direction: "plateau", weeksInTrend: 2 },
    }));
    expect(d.changeType).not.toBe("deload");
  });

  it("triggers weight progression on RPE <= 7 with all reps completed", () => {
    const d = decide(baseInputs({
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 48, avgRpe: 6.5,
                  estimated1rm: 130, performanceDeltaPct: 1 }],
    }));
    expect(d.changeType).toBe("progression");
    expect(d.reasonKey).toBe("rpe_low_full_reps");
    expect(d.suggestedWeightKg).toBe(105); // +5 kg compound
  });

  it("uses 2.5 kg step for isolation exercises", () => {
    const d = decide(baseInputs({
      exercise: { id: "ex2", primaryMuscleGroup: "biceps", isCompound: false },
      current: { sets: 3, repsMin: 10, repsMax: 12, suggestedWeightKg: 20 },
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 20, totalReps: 36, avgRpe: 6.5,
                  estimated1rm: 25, performanceDeltaPct: 1 }],
    }));
    expect(d.changeType).toBe("progression");
    expect(d.suggestedWeightKg).toBe(22.5);
  });

  it("triggers rep progression at moderate RPE without full top-reps", () => {
    const d = decide(baseInputs({
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 40, avgRpe: 7.8,
                  estimated1rm: 128, performanceDeltaPct: 0.5 }],
    }));
    // 4 sets * (8+1) = 36, totalReps 40 >= 36 → rep progression
    expect(d.changeType).toBe("progression");
    expect(d.reasonKey).toBe("rep_progression");
    expect(d.repsMin).toBe(9);
    expect(d.suggestedWeightKg).toBe(100); // weight unchanged
  });

  describe("volume landmarks (Rule 2.5)", () => {
    const histGood = [{
      sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 36, avgRpe: 7.2,
      estimated1rm: 130, performanceDeltaPct: 0.5,
    }];

    it("forces a deload (drop set) when weekly sets exceed MRV", () => {
      const d = decide(baseInputs({
        history: histGood,
        volume: { weekSetsForMuscle: 23, mev: 8, mav: 14, mrv: 22 },
      }));
      expect(d.changeType).toBe("deload");
      expect(d.reasonKey).toBe("volume_above_mrv");
      expect(d.sets).toBe(3); // 4 - 1
      expect(d.suggestedWeightKg).toBe(100); // weight unchanged
    });

    it("never drops below 2 sets even from a small starting count", () => {
      const d = decide(baseInputs({
        current: { sets: 2, repsMin: 8, repsMax: 12, suggestedWeightKg: 100 },
        history: histGood,
        volume: { weekSetsForMuscle: 30, mev: 8, mav: 14, mrv: 22 },
      }));
      expect(d.sets).toBe(2);
    });

    it("adds a set when weekly sets are below MEV", () => {
      const d = decide(baseInputs({
        history: histGood,
        volume: { weekSetsForMuscle: 6, mev: 8, mav: 14, mrv: 22 },
      }));
      expect(d.changeType).toBe("progression");
      expect(d.reasonKey).toBe("volume_below_mev");
      expect(d.sets).toBe(5); // 4 + 1
    });

    it("falls through to existing rules when sets are in MAV range", () => {
      // RPE 6.5 + all reps would normally trigger rpe_low_full_reps progression
      const d = decide(baseInputs({
        history: [{
          sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 48, avgRpe: 6.5,
          estimated1rm: 130, performanceDeltaPct: 1,
        }],
        volume: { weekSetsForMuscle: 12, mev: 8, mav: 14, mrv: 22 },
      }));
      expect(d.reasonKey).toBe("rpe_low_full_reps");
      expect(d.suggestedWeightKg).toBe(105);
    });

    it("disabled landmarks (mav=mrv=0) act as no-op even at high set counts", () => {
      const d = decide(baseInputs({
        history: histGood,
        volume: { weekSetsForMuscle: 50, mev: 0, mav: 0, mrv: 0 },
      }));
      expect(d.reasonKey).not.toBe("volume_above_mrv");
    });

    it("RPE 9 deload (Rule 2) overrides volume_above_mrv (Rule 2.5)", () => {
      // High RPE is concrete fatigue evidence — beats the volume threshold
      const d = decide(baseInputs({
        history: [{
          sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 32, avgRpe: 9.5,
          estimated1rm: 125, performanceDeltaPct: -1,
        }],
        volume: { weekSetsForMuscle: 30, mev: 8, mav: 14, mrv: 22 },
      }));
      expect(d.reasonKey).toBe("rpe_too_high");
    });

    it("recovery (Rule 1) overrides volume_above_mrv", () => {
      const future = "2026-04-29T08:00:00.000Z";
      const d = decide(baseInputs({
        recovery: { fullyRecoveredAt: future },
        history: histGood,
        volume: { weekSetsForMuscle: 30, mev: 8, mav: 14, mrv: 22 },
      }));
      expect(d.changeType).toBe("recovery");
      expect(d.reasonKey).toBe("muscle_unrecovered");
    });

    it("volume_below_mev overrides plateau_3_weeks (root cause: undertraining, not stagnation)", () => {
      const d = decide(baseInputs({
        history: histGood,
        trend: { direction: "plateau", weeksInTrend: 4 },
        volume: { weekSetsForMuscle: 5, mev: 8, mav: 14, mrv: 22 },
      }));
      expect(d.reasonKey).toBe("volume_below_mev");
    });

    it("renders volume_above_mrv reason with set count and MRV in German", () => {
      const text = renderReason(
        "volume_above_mrv",
        { weekSets: 23, mrv: 22, muscleGroup: "chest" },
        "de",
      );
      expect(text).toContain("23");
      expect(text).toContain("22");
      expect(text).toContain("chest");
    });
  });

  it("returns maintenance when no history exists", () => {
    const d = decide(baseInputs());
    expect(d.changeType).toBe("maintenance");
    expect(d.reasonKey).toBe("no_history");
  });

  it("returns maintenance when nothing else applies", () => {
    const d = decide(baseInputs({
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 36, avgRpe: 8.5,
                  estimated1rm: 128, performanceDeltaPct: 0.2 }],
    }));
    expect(d.changeType).toBe("maintenance");
    expect(d.reasonKey).toBe("optimal");
  });

  it("handles NULL avgRpe gracefully", () => {
    const d = decide(baseInputs({
      history: [{ sessionDate: "2026-04-27", maxWeightKg: 100, totalReps: 48, avgRpe: null,
                  estimated1rm: 130, performanceDeltaPct: null }],
    }));
    expect(d.changeType).toBe("maintenance");
  });

  it("handles NULL suggestedWeightKg in deload (no division)", () => {
    const d = decide(baseInputs({
      current: { sets: 4, repsMin: 8, repsMax: 12, suggestedWeightKg: null },
      history: [{ sessionDate: "2026-04-27", maxWeightKg: null, totalReps: 30, avgRpe: 9.5,
                  estimated1rm: null, performanceDeltaPct: null }],
    }));
    expect(d.changeType).toBe("deload");
    expect(d.suggestedWeightKg).toBeNull();
  });

  it("expired recovery date does not trigger recovery", () => {
    const past = "2026-04-27T08:00:00.000Z";
    const d = decide(baseInputs({
      recovery: { fullyRecoveredAt: past },
      history: [{ sessionDate: "2026-04-26", maxWeightKg: 100, totalReps: 48, avgRpe: 6,
                  estimated1rm: 130, performanceDeltaPct: 1 }],
    }));
    expect(d.changeType).toBe("progression");
  });
});

describe("renderReason", () => {
  it("substitutes German placeholders", () => {
    const text = renderReason("rpe_low_full_reps", { rpe: "6.5", step: "5.0" }, "de");
    expect(text).toContain("6.5");
    expect(text).toContain("5.0");
  });

  it("falls back to empty string for missing input", () => {
    const text = renderReason("plateau_3_weeks", {}, "de");
    expect(text).toContain("Wochen");
    expect(text).not.toContain("{weeks}");
  });
});
