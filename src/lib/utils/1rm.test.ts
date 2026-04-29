import { describe, it, expect } from "vitest";
import { estimated1rm, fmtKg } from "./1rm";

describe("estimated1rm", () => {
  it("returns 0 for non-positive inputs", () => {
    expect(estimated1rm(0, 5)).toBe(0);
    expect(estimated1rm(100, 0)).toBe(0);
    expect(estimated1rm(-10, 5)).toBe(0);
  });

  it("returns the load itself for a true 1-rep max", () => {
    expect(estimated1rm(100, 1)).toBe(100);
  });

  it("falls back to plain Epley when RPE is omitted", () => {
    // 100 * (1 + 5/30) = 116.666… → 116.7
    expect(estimated1rm(100, 5)).toBe(116.7);
  });

  it("treats null/undefined RPE as no adjustment", () => {
    expect(estimated1rm(100, 5, null)).toBe(116.7);
    expect(estimated1rm(100, 5, undefined)).toBe(116.7);
  });

  it("treats RPE 10 (failure) as no RIR added — equals plain Epley", () => {
    expect(estimated1rm(100, 5, 10)).toBe(116.7);
  });

  it("adds RIR to effective reps when RPE is below 10", () => {
    // RPE 7 → RIR 3 → effective reps 8 → 100 * (1 + 8/30) = 126.666… → 126.7
    expect(estimated1rm(100, 5, 7)).toBe(126.7);
  });

  it("a 5-rep at RPE 7 estimates higher than a 5-rep at RPE 10", () => {
    expect(estimated1rm(100, 5, 7)).toBeGreaterThan(estimated1rm(100, 5, 10));
  });

  it("caps RIR at 5 to prevent wild extrapolation from very easy sets", () => {
    // RPE 4 → raw RIR 6, capped to 5 → effective reps 6 → 100 * (1 + 6/30) = 120
    expect(estimated1rm(100, 1, 4)).toBe(120);
    // RPE 1 (absurdly easy) → still capped at RIR 5
    expect(estimated1rm(100, 1, 1)).toBe(120);
  });

  it("never lowers the estimate below the load itself for 1-rep with RPE", () => {
    expect(estimated1rm(100, 1, 10)).toBe(100);
  });

  it("clamps negative RIR (RPE > 10) to 0", () => {
    // Defensive: shouldn't happen, but if it does, no negative reps
    expect(estimated1rm(100, 5, 11)).toBe(116.7);
  });
});

describe("fmtKg", () => {
  it("renders an em-dash for null/undefined", () => {
    expect(fmtKg(null)).toBe("—");
    expect(fmtKg(undefined)).toBe("—");
  });

  it("drops decimals for whole numbers", () => {
    expect(fmtKg(100)).toBe("100 kg");
  });

  it("keeps one decimal for fractions", () => {
    expect(fmtKg(22.5)).toBe("22.5 kg");
  });
});
