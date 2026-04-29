import { describe, it, expect } from "vitest";
import {
  deriveTrendUpdate,
  weekStartOf,
  type SnapshotForTrend,
} from "./snapshots";

function snap(
  weekStart: string,
  avg1rm: number | null,
  trendDirection: SnapshotForTrend["trendDirection"] = null,
  weeksInTrend: number | null = null,
): SnapshotForTrend {
  return { weekStart, avg1rm, trendDirection, weeksInTrend };
}

describe("weekStartOf", () => {
  it("returns Monday for a mid-week date", () => {
    // 2026-04-29 is a Wednesday → Monday = 2026-04-27
    expect(weekStartOf("2026-04-29T10:00:00.000Z")).toBe("2026-04-27");
  });

  it("returns the same Monday when given a Monday", () => {
    expect(weekStartOf("2026-04-27T08:00:00.000Z")).toBe("2026-04-27");
  });

  it("rolls Sunday back to the prior Monday", () => {
    expect(weekStartOf("2026-05-03T20:00:00.000Z")).toBe("2026-04-27");
  });
});

describe("deriveTrendUpdate", () => {
  // current week starts 2026-04-27. Baseline weekStart = 2026-04-06 (3 weeks earlier).
  const CURRENT = "2026-04-27";
  const EXACT_BASELINE = "2026-04-06";

  it("returns null direction and null streak when there is no baseline at all", () => {
    const result = deriveTrendUpdate([], CURRENT, 130);
    expect(result.direction).toBeNull();
    expect(result.weeksInTrend).toBeNull();
  });

  it("classifies an upward trend when current beats baseline by ≥ 1.5%", () => {
    const result = deriveTrendUpdate([snap(EXACT_BASELINE, 100)], CURRENT, 102);
    expect(result.direction).toBe("up");
    expect(result.weeksInTrend).toBe(1);
  });

  it("classifies plateau within the noise band (between -2% and +1.5%)", () => {
    const result = deriveTrendUpdate([snap(EXACT_BASELINE, 100)], CURRENT, 101);
    expect(result.direction).toBe("plateau");
  });

  it("classifies downward trend when current is ≥ 2% below baseline", () => {
    const result = deriveTrendUpdate([snap(EXACT_BASELINE, 100)], CURRENT, 97);
    expect(result.direction).toBe("down");
  });

  it("falls back to a slightly older snapshot when the exact baseline week is missing (training-break tolerance)", () => {
    // Exact baseline week 2026-04-06 missing (training pause). Snapshot from one week
    // earlier (2026-03-30) should be used instead → real plateau, not a false-positive.
    const fallback = "2026-03-30";
    const result = deriveTrendUpdate([snap(fallback, 100)], CURRENT, 100);
    expect(result.direction).toBe("plateau");
  });

  it("ignores snapshots older than the fallback window (would otherwise compare to ancient data)", () => {
    // 8 weeks before current = far outside fallback window (3 + 3 = 6 weeks max).
    const tooOld = "2026-03-02";
    const result = deriveTrendUpdate([snap(tooOld, 100)], CURRENT, 100);
    expect(result.direction).toBeNull();
    expect(result.weeksInTrend).toBeNull();
  });

  it("does NOT trigger plateau when the user took a multi-week break (no baseline at all)", () => {
    // Regression guard: previously, classifyTrend returned "plateau" for null
    // baseline, which after 3 broken weeks would trigger plateau_3_weeks deload.
    const result = deriveTrendUpdate([], CURRENT, 130);
    expect(result.direction).not.toBe("plateau");
  });

  it("ignores snapshots whose avg1rm is null when picking a baseline", () => {
    // Two snapshots in window — the closer one is null, so the older real one wins.
    const result = deriveTrendUpdate(
      [snap("2026-03-30", 100), snap(EXACT_BASELINE, null)],
      CURRENT,
      100,
    );
    expect(result.direction).toBe("plateau");
  });

  it("extends weeksInTrend when the prior week's direction matches", () => {
    const result = deriveTrendUpdate(
      [
        snap(EXACT_BASELINE, 100),
        // prior week = 2026-04-20, plateau streak = 2
        snap("2026-04-20", 101, "plateau", 2),
      ],
      CURRENT,
      101,
    );
    expect(result.direction).toBe("plateau");
    expect(result.weeksInTrend).toBe(3);
  });

  it("resets weeksInTrend to 1 when direction flips", () => {
    const result = deriveTrendUpdate(
      [
        snap(EXACT_BASELINE, 100),
        snap("2026-04-20", 101, "down", 4),
      ],
      CURRENT,
      105, // up
    );
    expect(result.direction).toBe("up");
    expect(result.weeksInTrend).toBe(1);
  });

  it("does NOT extend a streak from a prior 'plateau' across a null baseline gap", () => {
    // After a training break the prior week may be a stale 'plateau'. With no
    // valid baseline, direction must be null and streak resets to null too.
    const result = deriveTrendUpdate(
      [snap("2026-04-20", 101, "plateau", 5)],
      CURRENT,
      101,
    );
    expect(result.direction).toBeNull();
    expect(result.weeksInTrend).toBeNull();
  });

  it("caps weeksInTrend at 12 to prevent unbounded streaks", () => {
    const result = deriveTrendUpdate(
      [
        snap(EXACT_BASELINE, 100),
        snap("2026-04-20", 100, "plateau", 12),
      ],
      CURRENT,
      100,
    );
    expect(result.weeksInTrend).toBe(12);
  });
});
