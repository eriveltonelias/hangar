export interface TourStep {
  id: string;
  /** CSS selector for the element to spotlight. Missing/unfound → centered modal. */
  target?: string;
  /** If set, the tour will switch to this screen before showing the step. */
  requiresScreen?: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "next-action",
    target: "[data-tour='next-action']",
    requiresScreen: "dashboard",
    title: "Your next step, always one click away",
    body:
      "Hangar ranks every signal - scan issues, expiring credentials, OTA mismatches, EAS auth - and surfaces the single most important thing here. Whenever you wonder \"what do I do now?\", look here first.",
    placement: "bottom",
  },
  {
    id: "sidebar-groups",
    target: "[data-tour='sidebar-nav']",
    title: "Three groups, one place for everything",
    body:
      "Ship is for builds, updates, and releases - the verbs. Health is the audit (Project Health, Router, Bundle size). Project holds environments, credentials, and settings. The Credentials dot turns red when a profile is expiring soon.",
    placement: "right",
  },
  {
    id: "environment-toggle",
    target: "[data-tour='environment-toggle']",
    requiresScreen: "dashboard",
    title: "Switch environments here",
    body:
      "Development, Preview, Production map to your EAS build profiles. Every screen in Hangar filters its data to match - Updates shows the right branch, Releases shows the right channel, the Dashboard hero warns about the right runtime. Set this first.",
    placement: "bottom",
  },
  {
    id: "ship-actions",
    target: "[data-tour='ship-actions']",
    requiresScreen: "dashboard",
    title: "Two ways to ship - pick the right one",
    body:
      "Deploy kicks off a native EAS build and submits it to the App Store or Google Play. Use it when native code, dependencies, or store metadata changed - and expect store review. Publish sends an over-the-air JS bundle to devices already running a matching build - instant, no review, but JS-only. Wrong choice = users stuck on stale code.",
    placement: "bottom",
  },
  {
    id: "cmdk",
    target: "[data-tour='cmdk-hint']",
    title: "Press ⌘K to go anywhere",
    body:
      "Open the command palette to jump to any screen, switch projects, rescan, run expo-doctor, refresh EAS data, or check credentials - without touching the mouse. Try it now: press ⌘K.",
    placement: "right",
  },
];

const STORAGE_KEY = "hangar.tour.completed";

export function hasCompletedTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markTourCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* ignore */
  }
}

export function resetTour(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
