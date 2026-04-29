import { describe, it, expect } from "vitest";
import { classifyVolumeStatus, DEFAULT_LANDMARKS, ALL_MUSCLE_GROUPS } from "./landmarks";

describe("classifyVolumeStatus", () => {
  const chest = DEFAULT_LANDMARKS.chest; // mv 4, mev 8, mav 14, mrv 22

  it("returns 'below_mev' when sets are under MEV", () => {
    expect(classifyVolumeStatus(0, chest)).toBe("below_mev");
    expect(classifyVolumeStatus(7, chest)).toBe("below_mev");
  });

  it("returns 'in_mav' when sets are in [MEV, MAV]", () => {
    expect(classifyVolumeStatus(8, chest)).toBe("in_mav");
    expect(classifyVolumeStatus(14, chest)).toBe("in_mav");
  });

  it("returns 'above_mav' when sets are in (MAV, MRV]", () => {
    expect(classifyVolumeStatus(15, chest)).toBe("above_mav");
    expect(classifyVolumeStatus(22, chest)).toBe("above_mav");
  });

  it("returns 'above_mrv' when sets exceed MRV", () => {
    expect(classifyVolumeStatus(23, chest)).toBe("above_mrv");
    expect(classifyVolumeStatus(50, chest)).toBe("above_mrv");
  });

  it("returns 'disabled' for full_body (mav=mrv=0)", () => {
    expect(classifyVolumeStatus(0, DEFAULT_LANDMARKS.full_body)).toBe("disabled");
    expect(classifyVolumeStatus(20, DEFAULT_LANDMARKS.full_body)).toBe("disabled");
  });

  it("handles fractional sets (secondary 0.5x)", () => {
    expect(classifyVolumeStatus(7.5, chest)).toBe("below_mev");
    expect(classifyVolumeStatus(14.5, chest)).toBe("above_mav");
  });
});

describe("DEFAULT_LANDMARKS", () => {
  it("covers every muscle group enum value", () => {
    expect(ALL_MUSCLE_GROUPS).toHaveLength(12);
    for (const g of ALL_MUSCLE_GROUPS) {
      const l = DEFAULT_LANDMARKS[g];
      expect(l).toBeDefined();
    }
  });

  it("preserves the invariant MV ≤ MEV ≤ MAV ≤ MRV for every group except full_body", () => {
    for (const g of ALL_MUSCLE_GROUPS) {
      if (g === "full_body") continue;
      const { mv, mev, mav, mrv } = DEFAULT_LANDMARKS[g];
      expect(mv, `${g}: MV ≤ MEV`).toBeLessThanOrEqual(mev);
      expect(mev, `${g}: MEV ≤ MAV`).toBeLessThanOrEqual(mav);
      expect(mav, `${g}: MAV ≤ MRV`).toBeLessThanOrEqual(mrv);
    }
  });

  it("seeds full_body as a no-op (all zeros) so volume rules never fire", () => {
    expect(DEFAULT_LANDMARKS.full_body).toEqual({ mv: 0, mev: 0, mav: 0, mrv: 0 });
  });
});
