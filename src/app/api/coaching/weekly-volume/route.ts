import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { weekStartOf } from "@/lib/coaching/snapshots";
import {
  ALL_MUSCLE_GROUPS,
  classifyVolumeStatus,
  getLandmarksForUser,
  type MuscleGroup,
  type VolumeStatus,
} from "@/lib/coaching/landmarks";
import { computeWeeklyVolumeFor } from "@/lib/coaching/volume";

export type WeeklyVolumeEntry = {
  muscleGroup: MuscleGroup;
  weekSets: number;
  mv: number;
  mev: number;
  mav: number;
  mrv: number;
  status: VolumeStatus;
};

export type WeeklyVolumeResponse = {
  weekStart: string;
  groups: WeeklyVolumeEntry[];
};

// GET /api/coaching/weekly-volume — current week's set count + landmarks per muscle group
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const weekStart = weekStartOf(new Date().toISOString());

  const [landmarks, volumes] = await Promise.all([
    getLandmarksForUser(db, userId, ALL_MUSCLE_GROUPS),
    computeWeeklyVolumeFor(db, userId, weekStart, ALL_MUSCLE_GROUPS),
  ]);

  const groups: WeeklyVolumeEntry[] = ALL_MUSCLE_GROUPS.map((mg) => {
    const l = landmarks.get(mg) ?? { mv: 0, mev: 0, mav: 0, mrv: 0 };
    const weekSets = volumes.get(mg) ?? 0;
    return {
      muscleGroup: mg,
      weekSets,
      mv: l.mv, mev: l.mev, mav: l.mav, mrv: l.mrv,
      status: classifyVolumeStatus(weekSets, l),
    };
  });

  const body: WeeklyVolumeResponse = { weekStart, groups };
  return NextResponse.json(body);
}
