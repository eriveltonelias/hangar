import { create } from "zustand";
import type { Issue } from "@hangar/core";
import { relativeTime } from "@hangar/core";
import type { AppState } from "./types";
import { computeInitialState } from "./helpers";
import { createUiSlice } from "./ui-slice";
import { createProjectsSlice } from "./projects-slice";
import { createScanSlice } from "./scan-slice";
import { createEasSlice } from "./eas-slice";
import { createToastsSlice } from "./toasts-slice";
import { createOnboardingSlice } from "./onboarding-slice";

export const useAppStore = create<AppState>((set, get) => {
  const init = computeInitialState();
  return {
    ...createUiSlice(set),
    ...createProjectsSlice(set, get, init),
    ...createScanSlice(set, get, init),
    ...createEasSlice(set, get),
    ...createToastsSlice(set),
    ...createOnboardingSlice(set, get),
  };
});

export function getIssuesBySeverity(issues: Issue[], severity: Issue["severity"]) {
  return issues.filter((i) => i.severity === severity);
}

export function getActionableIssues(issues: Issue[]) {
  return issues.filter((i) => i.severity !== "passed");
}

export { relativeTime };
export type { AppState } from "./types";
