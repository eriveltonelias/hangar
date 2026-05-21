import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Sidebar, TopBar } from "@/components/layout/AppShell";
import { EasLoginRequired } from "@/components/EasLoginRequired";
import { RemoveProjectDialog } from "@/components/RemoveProjectDialog";
import { NoProjectsOnboarding } from "@/screens/NoProjectsOnboarding";
import { AppRouter } from "@/routes/AppRouter";
import { Toaster } from "@/components/Toaster";
import { CommandPalette } from "@/components/CommandPalette";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/notify";

function ScanningOverlay() {
  const isScanning = useAppStore((s) => s.isScanning);
  const isSelectingProject = useAppStore((s) => s.isSelectingProject);
  const projectName = useAppStore((s) => s.projectName);

  if (!isScanning && !isSelectingProject) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-8 py-6 shadow-xl">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm font-medium">
          {isSelectingProject ? "Opening project…" : `Scanning ${projectName ?? "project"}…`}
        </p>
        <p className="text-xs text-muted-foreground">Reading local files - nothing leaves your machine</p>
      </div>
    </div>
  );
}

function BackgroundRefreshBanner() {
  const isBackgroundRefreshing = useAppStore((s) => s.isBackgroundRefreshing);
  const isLoadingEas = useAppStore((s) => s.isLoadingEas);

  if (!isBackgroundRefreshing && !isLoadingEas) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-6 py-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{isBackgroundRefreshing ? "Updating project scan…" : "Refreshing EAS data…"}</span>
    </div>
  );
}

function ScanErrorBanner() {
  const scanError = useAppStore((s) => s.scanError);
  const setScanError = useAppStore((s) => s.setScanError);

  if (!scanError) return null;

  return (
    <div className="flex items-center justify-between border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-xs text-destructive">
      <span>{scanError}</span>
      <button type="button" onClick={() => setScanError(null)} className="font-medium hover:underline">
        Dismiss
      </button>
    </div>
  );
}

function useEasErrorToasts() {
  const easError = useAppStore((s) => s.easError);
  const setEasError = useAppStore((s) => s.setEasError);
  useEffect(() => {
    if (!easError) return;
    toast.error({
      title: "EAS error",
      description: easError,
      durationMs: 10_000,
    });
    setEasError(null);
  }, [easError, setEasError]);
}

/**
 * Fire the onboarding tour the first time the app transitions from
 * "no projects" to "has projects" in this session, provided the user hasn't
 * already completed/dismissed it.
 *
 * Two-phase trigger:
 *   1. The transition 0 → ≥1 sets a `pending` flag (a ref, so it survives
 *      React re-renders without re-firing).
 *   2. We wait until `isScanning` is false before actually starting the tour
 *      - otherwise the tour overlay would stack on top of the "Scanning
 *      project…" loader.
 *
 * Implemented at the App level rather than inline in `addProject` so any
 * pathway that adds a project (CLI import, drop zone, etc.) gets the same
 * first-run treatment.
 */
function useFirstProjectTour() {
  const projectsLength = useAppStore((s) => s.projects.length);
  const isScanning = useAppStore((s) => s.isScanning);
  const tourCompleted = useAppStore((s) => s.tourCompleted);
  const tourActive = useAppStore((s) => s.tourActive);
  const startTour = useAppStore((s) => s.startTour);
  const prevCount = useRef(projectsLength);
  const pending = useRef(false);

  // Phase 1: detect the 0 → ≥1 transition.
  useEffect(() => {
    const justAddedFirst = prevCount.current === 0 && projectsLength >= 1;
    prevCount.current = projectsLength;
    if (justAddedFirst && !tourCompleted && !tourActive) {
      pending.current = true;
    }
  }, [projectsLength, tourCompleted, tourActive]);

  // Phase 2: once scanning settles, start the tour after a small delay so the
  // dashboard has rendered its NextActionHero target.
  useEffect(() => {
    if (!pending.current) return;
    if (isScanning) return;
    if (tourCompleted || tourActive) {
      pending.current = false;
      return;
    }
    pending.current = false;
    const t = setTimeout(() => {
      if (!useAppStore.getState().tourCompleted && !useAppStore.getState().tourActive) {
        startTour();
      }
    }, 400);
    return () => clearTimeout(t);
  }, [isScanning, tourCompleted, tourActive, startTour]);
}

export function App() {
  const hasProjects = useAppStore((s) => s.projects.length > 0);
  useEasErrorToasts();
  useFirstProjectTour();

  if (!hasProjects) {
    return (
      <div className="h-dvh w-full overflow-hidden bg-background">
        <NoProjectsOnboarding />
        <ScanningOverlay />
        <RemoveProjectDialog />
        <Toaster />
        <CommandPalette />
        <OnboardingTour />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <EasLoginRequired variant="banner" />
        <BackgroundRefreshBanner />
        <ScanErrorBanner />
        <main className="flex-1 overflow-y-auto">
          <AppRouter />
        </main>
      </div>
      <ScanningOverlay />
      <RemoveProjectDialog />
      <Toaster />
      <CommandPalette />
      <OnboardingTour />
    </div>
  );
}
