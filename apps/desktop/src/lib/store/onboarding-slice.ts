import { hasCompletedTour, markTourCompleted, resetTour, TOUR_STEPS } from "../onboarding";
import type { GetState, OnboardingSlice, SetState } from "./types";

export function createOnboardingSlice(set: SetState, get: GetState): OnboardingSlice {
  return {
    tourActive: false,
    tourStepIndex: 0,
    tourCompleted: hasCompletedTour(),

    startTour: () => {
      set({ tourActive: true, tourStepIndex: 0 });
      const step = TOUR_STEPS[0];
      if (step?.requiresScreen && get().activeScreen !== step.requiresScreen) {
        set({ activeScreen: step.requiresScreen });
      }
    },

    nextTourStep: () => {
      const next = get().tourStepIndex + 1;
      if (next >= TOUR_STEPS.length) {
        markTourCompleted();
        set({ tourActive: false, tourCompleted: true, tourStepIndex: 0 });
        return;
      }
      const step = TOUR_STEPS[next];
      set({ tourStepIndex: next });
      if (step?.requiresScreen && get().activeScreen !== step.requiresScreen) {
        set({ activeScreen: step.requiresScreen });
      }
    },

    prevTourStep: () => {
      const prev = Math.max(0, get().tourStepIndex - 1);
      const step = TOUR_STEPS[prev];
      set({ tourStepIndex: prev });
      if (step?.requiresScreen && get().activeScreen !== step.requiresScreen) {
        set({ activeScreen: step.requiresScreen });
      }
    },

    dismissTour: () => {
      markTourCompleted();
      set({ tourActive: false, tourCompleted: true, tourStepIndex: 0 });
    },

    replayTour: () => {
      resetTour();
      set({ tourCompleted: false });
      get().startTour();
    },
  };
}
