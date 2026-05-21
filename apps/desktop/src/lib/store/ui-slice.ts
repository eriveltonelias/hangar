import type { SetState, UiSlice } from "./types";

export function createUiSlice(set: SetState): UiSlice {
  return {
    activeScreen: "dashboard",
    setActiveScreen: (activeScreen) => set({ activeScreen }),
  };
}
