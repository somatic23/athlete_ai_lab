import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SetOutcome = "completed" | "failure" | "partial" | "skipped";

export type LoggedSet = {
  localId: string;
  setNumber: number;
  weightKg: number | null;
  repsCompleted: number | null;
  rpe: number | null;
  outcome: SetOutcome;
  notes: string;
  savedId?: string; // populated after API save
  estimated1rm?: number;
  isPR?: boolean;
};

export type WorkoutExercise = {
  planExerciseId: string | null;
  exerciseId: string;
  name: string;
  targetSets: number;
  repsMin: number;
  repsMax: number | null;
  targetRpe: number | null;
  restSeconds: number | null;
  suggestedWeightKg: number | null;
  notes: string | null;
  loggedSets: LoggedSet[];
};

export type ActiveWorkout = {
  sessionId: string;
  title: string;
  trainingDayId: string | null;
  startedAt: string;
  exercises: WorkoutExercise[];
};

type WorkoutStore = {
  activeWorkout: ActiveWorkout | null;
  restTimerSeconds: number;
  restTimerActive: boolean;
  restTimerExerciseIdx: number | null;

  startWorkout: (workout: ActiveWorkout) => void;
  addExercise: (exercise: WorkoutExercise) => void;
  addLoggedSet: (exerciseIdx: number, set: LoggedSet) => void;
  updateLoggedSet: (exerciseIdx: number, setLocalId: string, patch: Partial<LoggedSet>) => void;
  removeLoggedSet: (exerciseIdx: number, setLocalId: string) => void;
  startRestTimer: (seconds: number, exerciseIdx: number) => void;
  tickRestTimer: () => void;
  stopRestTimer: () => void;
  clearWorkout: () => void;
};

export const useWorkoutStore = create<WorkoutStore>()(
  persist(
    (set) => ({
      activeWorkout: null,
      restTimerSeconds: 0,
      restTimerActive: false,
      restTimerExerciseIdx: null,

      startWorkout: (workout) => set({ activeWorkout: workout }),

      addExercise: (exercise) =>
        set((state) => {
          if (!state.activeWorkout) return state;
          return {
            activeWorkout: {
              ...state.activeWorkout,
              exercises: [...state.activeWorkout.exercises, exercise],
            },
          };
        }),

      addLoggedSet: (exerciseIdx, loggedSet) =>
        set((state) => {
          if (!state.activeWorkout) return state;
          const exercises = state.activeWorkout.exercises.map((ex, i) =>
            i === exerciseIdx
              ? { ...ex, loggedSets: [...ex.loggedSets, loggedSet] }
              : ex
          );
          return { activeWorkout: { ...state.activeWorkout, exercises } };
        }),

      updateLoggedSet: (exerciseIdx, setLocalId, patch) =>
        set((state) => {
          if (!state.activeWorkout) return state;
          const exercises = state.activeWorkout.exercises.map((ex, i) =>
            i === exerciseIdx
              ? {
                  ...ex,
                  loggedSets: ex.loggedSets.map((s) =>
                    s.localId === setLocalId ? { ...s, ...patch } : s
                  ),
                }
              : ex
          );
          return { activeWorkout: { ...state.activeWorkout, exercises } };
        }),

      removeLoggedSet: (exerciseIdx, setLocalId) =>
        set((state) => {
          if (!state.activeWorkout) return state;
          const exercises = state.activeWorkout.exercises.map((ex, i) =>
            i === exerciseIdx
              ? { ...ex, loggedSets: ex.loggedSets.filter((s) => s.localId !== setLocalId) }
              : ex
          );
          return { activeWorkout: { ...state.activeWorkout, exercises } };
        }),

      startRestTimer: (seconds, exerciseIdx) =>
        set({ restTimerSeconds: seconds, restTimerActive: true, restTimerExerciseIdx: exerciseIdx }),

      tickRestTimer: () =>
        set((state) => {
          if (!state.restTimerActive) return state;
          if (state.restTimerSeconds <= 1) {
            return { restTimerSeconds: 0, restTimerActive: false, restTimerExerciseIdx: null };
          }
          return { restTimerSeconds: state.restTimerSeconds - 1 };
        }),

      stopRestTimer: () =>
        set({ restTimerSeconds: 0, restTimerActive: false, restTimerExerciseIdx: null }),

      clearWorkout: () =>
        set({ activeWorkout: null, restTimerSeconds: 0, restTimerActive: false, restTimerExerciseIdx: null }),
    }),
    { name: "workout-store" }
  )
);
