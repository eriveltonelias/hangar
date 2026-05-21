import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  AlertTriangle,
  Apple,
  CheckCircle2,
  Circle,
  Loader2,
  Smartphone,
  Store,
  XCircle,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Progress,
  ScrollArea,
} from "@hangar/ui";
import {
  evaluateDeployReadiness,
  getDeployStoreLabel,
  getSubmitStrategy,
  buildReleaseReadiness,
  type DeployReadiness,
  type DeployRequirement,
  type DeployStore,
  type SubmitStrategyDetails,
} from "@hangar/core";
import { useAppStore } from "@/lib/store";
import { deployToStore, runTestFlight, loadProjectEasJson } from "@/lib/eas-service";
import { notify } from "@/lib/notify";
import { checkGitStatus, createProjectFs } from "@/lib/services";
import { isTauri } from "@/lib/platform";

type DialogStep =
  | "checking"
  | "dirty"
  | "blocked"
  | "select-store"
  | "review"
  | "deploying"
  | "success"
  | "failed";

type DeployPhase = "starting" | "building" | "submitting" | "finishing";

interface DeployDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEPLOY_STEPS: { id: DeployPhase | "done"; label: string }[] = [
  { id: "starting", label: "Starting" },
  { id: "building", label: "Building" },
  { id: "submitting", label: "Submitting" },
  { id: "finishing", label: "Finishing" },
  { id: "done", label: "Done" },
];

const PHASE_PROGRESS: Record<DeployPhase | "done", number> = {
  starting: 10,
  building: 45,
  submitting: 75,
  finishing: 92,
  done: 100,
};

function formatGitChange(line: string): string {
  const status = line.slice(0, 2);
  const file = line.slice(3).trim();
  const label =
    status === "??"
      ? "Untracked"
      : status.includes("D")
        ? "Deleted"
        : status.includes("A")
          ? "Added"
          : status.includes("M")
            ? "Modified"
            : "Changed";
  return `${label}: ${file}`;
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function cleanLogLine(line: string): string {
  return line.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").trim();
}

function summarizeDeployError(error: string | null, logLines: string[]): string {
  const candidates = [
    ...logLines.map(cleanLogLine),
    ...(error?.split("\n").map(cleanLogLine) ?? []),
  ].filter(Boolean);

  const failureLine = [...candidates]
    .reverse()
    .find((line) => /build command failed|error:|failed|✖|×/i.test(line));
  if (failureLine) return failureLine;

  if (error) {
    const trimmed = error.trim();
    const lines = trimmed.split("\n").map(cleanLogLine).filter(Boolean);
    if (lines.length <= 2) return trimmed;
    return lines[0] ?? "Deploy failed.";
  }

  return "Deploy failed.";
}

function getFailureLogs(error: string | null, logLines: string[]): string[] {
  if (logLines.length > 0) return logLines;
  if (!error) return [];
  return error.split("\n").map(cleanLogLine).filter(Boolean);
}

function detectDeployPhase(line: string): DeployPhase | null {
  const lower = line.toLowerCase();
  if (
    lower.includes("submitting") ||
    lower.includes("app store connect") ||
    lower.includes("google play") ||
    lower.includes("uploaded to") ||
    lower.includes("submitted")
  ) {
    return "submitting";
  }
  if (
    lower.includes("build finished") ||
    lower.includes("build completed") ||
    lower.includes("successfully") ||
    lower.includes("processing")
  ) {
    return "finishing";
  }
  if (
    lower.includes("gradlew") ||
    lower.includes("xcode") ||
    lower.includes("compiling") ||
    lower.includes("building") ||
    lower.includes("archive") ||
    lower.includes("eas build")
  ) {
    return "building";
  }
  return null;
}

function phaseIndex(phase: DeployPhase | "done"): number {
  return DEPLOY_STEPS.findIndex((step) => step.id === phase);
}

function SubmitStrategyCard({ strategy }: { strategy: SubmitStrategyDetails }) {
  const tone =
    strategy.strategy === "missing"
      ? {
          ring: "border-destructive/30 bg-destructive/[0.06]",
          chip: "bg-destructive/15 text-destructive",
          chipLabel: "Action needed",
        }
      : strategy.strategy === "testflight"
        ? {
            ring: "border-primary/30 bg-primary/[0.05]",
            chip: "bg-primary/15 text-primary",
            chipLabel: "Zero-config",
          }
        : {
            ring: "border-success/30 bg-success/[0.05]",
            chip: "bg-success/15 text-success",
            chipLabel: "Configured",
          };

  const isIosMissing =
    strategy.strategy === "missing" && strategy.label.toLowerCase().includes("ios");

  // For the iOS-partial case, render a copy-pasteable snippet showing the
  // minimum block to add. Users who don't want to do that can instead
  // delete the partial block and the next preflight will flip to testflight.
  const iosCompletionSnippet =
    isIosMissing && strategy.missingFields && strategy.missingFields.length > 0
      ? JSON.stringify(
          {
            submit: {
              production: {
                ios: Object.fromEntries(
                  strategy.missingFields.map((field) => [field, `<your ${field}>`]),
                ),
              },
            },
          },
          null,
          2,
        )
      : null;

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-xs", tone.ring)}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-foreground">{strategy.label}</p>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tone.chip)}>
          {tone.chipLabel}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {strategy.description}
      </p>

      {iosCompletionSnippet && (
        <div className="mt-2 rounded-md border border-zinc-800/60 bg-[#0a0a0f] p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Option A — merge into eas.json
          </p>
          <pre className="mt-1 overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-zinc-100">
            {iosCompletionSnippet}
          </pre>
          <p className="mt-2 text-[10px] text-zinc-400">
            Option B — delete the entire <code className="font-mono text-zinc-200">submit.production.ios</code> block so Hangar can use npx testflight.
          </p>
        </div>
      )}

      {strategy.strategy === "missing" && (
        <a
          href={
            isIosMissing
              ? "https://docs.expo.dev/submit/ios/#configuring-submission"
              : "https://docs.expo.dev/submit/android/"
          }
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          {isIosMissing ? "iOS submit profile docs" : "Android submit profile docs"}
        </a>
      )}
      {strategy.strategy === "testflight" && (
        <a
          href="https://docs.expo.dev/build-reference/npx-testflight/"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          npx testflight docs
        </a>
      )}
    </div>
  );
}

function RequirementRow({ requirement }: { requirement: DeployRequirement }) {
  const Icon =
    requirement.status === "pass"
      ? CheckCircle2
      : requirement.status === "fail"
        ? XCircle
        : AlertTriangle;
  const colorClass =
    requirement.status === "pass"
      ? "text-success"
      : requirement.status === "fail"
        ? "text-destructive"
        : "text-warning";

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-secondary/10 px-3 py-2">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", colorClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{requirement.label}</p>
        {requirement.description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {requirement.description}
          </p>
        )}
      </div>
    </div>
  );
}

export function DeployDialog({ open, onOpenChange }: DeployDialogProps) {
  const projectPath = useAppStore((s) => s.projectPath);
  const settings = useAppStore((s) => s.settings);
  const scanResult = useAppStore((s) => s.scanResult);
  const easData = useAppStore((s) => s.easData);
  const easAuth = useAppStore((s) => s.easAuth);
  const expoDoctor = useAppStore((s) => s.expoDoctor);
  const refreshBuildsAfterDeploy = useAppStore((s) => s.refreshBuildsAfterDeploy);
  // The race-guard inside handleDeploy reads `isDeploying` via getState() (so
  // it gets fresh value at click time, not the captured-by-render value). The
  // setter is the only thing we need from the hook here.
  const setIsDeploying = useAppStore((s) => s.setIsDeploying);

  const [step, setStep] = useState<DialogStep>("checking");
  const [gitChanges, setGitChanges] = useState<string[]>([]);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [store, setStore] = useState<DeployStore | null>(null);
  const [readiness, setReadiness] = useState<DeployReadiness | null>(null);
  const [submitStrategy, setSubmitStrategy] = useState<SubmitStrategyDetails | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployPhase, setDeployPhase] = useState<DeployPhase>("starting");
  const [statusLine, setStatusLine] = useState("Starting EAS build…");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const profile = "production";

  const resetState = useCallback(() => {
    setStep("checking");
    setGitChanges([]);
    setCheckError(null);
    setStore(null);
    setReadiness(null);
    setSubmitStrategy(null);
    setReviewConfirmed(false);
    setDeployError(null);
    setDeployPhase("starting");
    setStatusLine("Starting EAS build…");
    setLogLines([]);
    setElapsedSeconds(0);
  }, []);

  const buildReadiness = useCallback(
    async (
      selectedStore: DeployStore,
      gitClean: boolean,
    ): Promise<{ readiness: DeployReadiness; strategy: SubmitStrategyDetails } | null> => {
      if (!projectPath) return null;
      const fs = await createProjectFs(projectPath);
      const easJson = await loadProjectEasJson(projectPath, fs);
      const readinessResult = evaluateDeployReadiness({
        store: selectedStore,
        profile,
        scanResult,
        releaseReadiness: easData
          ? buildReleaseReadiness(scanResult, easData.builds, easData.updates, "production")
          : null,
        expoDoctor,
        easJson,
        gitClean,
        easLoggedIn: easAuth?.state === "logged-in",
      });
      const strategy = getSubmitStrategy(easJson, profile, selectedStore);
      return { readiness: readinessResult, strategy };
    },
    [projectPath, profile, scanResult, easData, expoDoctor, easAuth?.state],
  );

  const runPreflight = useCallback(async () => {
    if (!projectPath) {
      setCheckError("No project selected.");
      setStep("blocked");
      return;
    }

    if (!isTauri()) {
      setCheckError("Deploying requires the Hangar desktop app.");
      setStep("blocked");
      return;
    }

    if (easAuth?.state === "cli-not-found") {
      setCheckError("EAS CLI not found. Install it with: npm install -g eas-cli");
      setStep("blocked");
      return;
    }

    if (easAuth?.state === "not-logged-in") {
      setCheckError("You must be logged in to EAS. Run eas login in your terminal first.");
      setStep("blocked");
      return;
    }

    setStep("checking");
    setCheckError(null);
    setGitChanges([]);

    try {
      const status = await checkGitStatus(projectPath);
      if (!status.clean) {
        setGitChanges(status.changes);
        setStep("dirty");
        return;
      }
      setStep("select-store");
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
      setStep("blocked");
    }
  }, [projectPath, easAuth?.state]);

  const handleSelectStore = async (selectedStore: DeployStore) => {
    setStore(selectedStore);
    setReviewConfirmed(false);
    setStep("review");

    try {
      const result = await buildReadiness(selectedStore, true);
      setReadiness(result?.readiness ?? null);
      setSubmitStrategy(result?.strategy ?? null);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
      setStep("blocked");
    }
  };

  useEffect(() => {
    if (!open) return;
    resetState();
    void runPreflight();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && step !== "deploying") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, step, onOpenChange]);

  useEffect(() => {
    if (step !== "deploying") return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [logLines]);

  const handleClose = () => {
    if (step === "deploying") return;
    onOpenChange(false);
  };

  const handleDeploy = async () => {
    if (!projectPath || !store || !readiness?.canDeploy || !reviewConfirmed) return;

    // Race guard: refuse to start a second deploy while one is in flight.
    // Even though the dialog's own state would block this, a previous deploy
    // could have left the dialog closed mid-build (we never cancel the EAS
    // job itself), and re-opening must not let the user spawn a duplicate.
    if (useAppStore.getState().isDeploying) {
      setDeployError(
        "Another deploy is already running. Wait for it to finish or check the Builds tab.",
      );
      setStep("failed");
      return;
    }

    // Block here defensively - the review step won't show a Deploy button
    // when strategy === "missing", but if anything slips through we surface
    // the same error rather than spawn a broken command.
    if (submitStrategy?.strategy === "missing") {
      setDeployError(submitStrategy.description);
      setStep("failed");
      return;
    }

    flushSync(() => {
      setStep("deploying");
      setDeployError(null);
      setDeployPhase("starting");
      setStatusLine(
        submitStrategy?.strategy === "testflight"
          ? "Starting npx testflight…"
          : "Starting EAS build…",
      );
      setLogLines([]);
      setElapsedSeconds(0);
    });
    setIsDeploying(true);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const onLogLine = (line: string, stream: "stdout" | "stderr") => {
      const cleaned = cleanLogLine(line);
      if (!cleaned) return;

      const phase = detectDeployPhase(cleaned);
      if (phase) {
        setDeployPhase(phase);
      }

      if (stream === "stderr" && /error|failed/i.test(cleaned)) {
        setStatusLine(cleaned);
      } else if (cleaned.length > 0) {
        setStatusLine(cleaned);
      }

      setLogLines((previous) => {
        const next = [...previous, cleaned];
        return next.length > 80 ? next.slice(-80) : next;
      });
    };

    try {
      if (submitStrategy?.strategy === "testflight") {
        await runTestFlight(projectPath, readiness.profile, onLogLine);
      } else {
        await deployToStore(projectPath, store, readiness.profile, settings.easCliPath, onLogLine);
      }

      setDeployPhase("finishing");
      setStatusLine("Build submitted successfully.");
      setStep("success");
      void refreshBuildsAfterDeploy();
      void notify({
        title: "Deploy submitted",
        description: `${store === "ios" ? "iOS" : "Android"} build sent to EAS - check Builds for status.`,
        variant: "success",
        action: { label: "Open Builds", onClick: "/builds" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDeployError(message);
      setStep("failed");
      void notify({
        title: "Deploy failed",
        description: message,
        variant: "error",
        durationMs: 10_000,
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const currentPhaseIndex = phaseIndex(deployPhase);
  const blockingCount = readiness?.requirements.filter((req) => req.status === "fail").length ?? 0;
  const warningCount = readiness?.requirements.filter((req) => req.status === "warn").length ?? 0;
  const failureSummary = summarizeDeployError(deployError, logLines);
  const failureLogs = getFailureLogs(deployError, logLines);
  const usesFlexBody = step === "review" || step === "failed";

  if (!open) return null;

  const reviewFooter =
    step === "review" && store && readiness ? (
      <div className="shrink-0 space-y-3 border-t border-border/60 bg-card px-5 py-4">
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 px-3 py-2.5">
          <input
            type="checkbox"
            checked={reviewConfirmed}
            onChange={(event) => setReviewConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            I have reviewed all requirements and understand this will build and submit to{" "}
            {getDeployStoreLabel(store)}.
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStep("select-store")}>
            Back
          </Button>
          <Button
            onClick={() => void handleDeploy()}
            disabled={
              !readiness.canDeploy ||
              !reviewConfirmed ||
              submitStrategy?.strategy === "missing"
            }
            title={
              submitStrategy?.strategy === "missing"
                ? submitStrategy.description
                : undefined
            }
          >
            {submitStrategy?.strategy === "testflight"
              ? "Build & upload to TestFlight"
              : `Deploy to ${store === "ios" ? "App Store" : "Google Play"}`}
          </Button>
        </div>
      </div>
    ) : null;

  const failedFooter =
    step === "failed" ? (
      <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-card px-5 py-4">
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
        <Button onClick={() => setStep("review")}>Try again</Button>
      </div>
    ) : null;

  const dialogFooter = reviewFooter ?? failedFooter;

  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-default items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <Card
        className="flex max-h-[min(90vh,620px)] w-full max-w-lg flex-col overflow-hidden shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader className="shrink-0 border-b border-border/60 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="h-5 w-5 text-primary" />
            Deploy to Store
          </CardTitle>
        </CardHeader>
        <CardContent
          className={cn(
            "min-h-0 flex-1 pt-0",
            usesFlexBody
              ? "flex flex-col overflow-hidden"
              : "space-y-4 overflow-y-auto overscroll-contain",
          )}
        >
          {step === "checking" && (
            <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Checking git status…
            </div>
          )}

          {step === "dirty" && (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="text-sm font-medium text-warning">Working tree is not clean</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Commit or stash your changes before submitting to app stores.
                  </p>
                </div>
              </div>
              <ScrollArea className="max-h-48 rounded-lg border border-border bg-secondary/20">
                <ul className="space-y-1 p-3 font-mono text-xs text-muted-foreground">
                  {gitChanges.map((change) => (
                    <li key={change}>{formatGitChange(change)}</li>
                  ))}
                </ul>
              </ScrollArea>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={handleClose}>
                  Close
                </Button>
                <Button onClick={() => void runPreflight()}>Check again</Button>
              </div>
            </>
          )}

          {step === "blocked" && (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{checkError}</p>
              </div>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </>
          )}

          {step === "select-store" && (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3 mt-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-sm text-muted-foreground">
                  Git working tree is clean. Choose where to deploy.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void handleSelectStore("ios")}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
                >
                  <Apple className="h-8 w-8 text-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">App Store</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">TestFlight via EAS Submit</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSelectStore("android")}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
                >
                  <Smartphone className="h-8 w-8 text-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Google Play</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Production track via EAS Submit</p>
                  </div>
                </button>
              </div>

              <div className="flex justify-end">
                <Button variant="secondary" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {step === "review" && store && readiness && (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="shrink-0 space-y-3">
                <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 text-xs">
                  <p>
                    <span className="font-medium text-foreground">Destination:</span>{" "}
                    {getDeployStoreLabel(store)}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-foreground">Profile:</span> {readiness.profile}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{readiness.command}</p>
                </div>

                {submitStrategy && <SubmitStrategyCard strategy={submitStrategy} />}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {blockingCount > 0 ? (
                    <span className="text-destructive">{blockingCount} blocking issue(s)</span>
                  ) : (
                    <span className="text-success">All blocking checks passed</span>
                  )}
                  {warningCount > 0 && (
                    <span className="text-warning">{warningCount} warning(s) to review</span>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border">
                <div className="space-y-2 p-2">
                  {readiness.requirements.map((requirement) => (
                    <RequirementRow key={requirement.id} requirement={requirement} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "deploying" && store && (
            <div className="flex flex-col gap-4 py-1">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Deploying to {getDeployStoreLabel(store)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatElapsed(elapsedSeconds)} elapsed
                  </p>
                </div>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              </div>

              <div className="shrink-0">
                <Progress value={PHASE_PROGRESS[deployPhase]} />
              </div>

              <div className="grid shrink-0 grid-cols-5 gap-1">
                {DEPLOY_STEPS.map((item, index) => {
                  const active = index === currentPhaseIndex;
                  const complete = index < currentPhaseIndex;
                  return (
                    <div key={item.id} className="flex min-w-0 flex-col items-center gap-1 text-center">
                      {complete ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : active ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                      <span
                        className={`truncate text-[10px] leading-tight ${
                          active ? "font-medium text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="shrink-0 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
                <p className="truncate text-xs text-foreground">{statusLine}</p>
              </div>

              <div className="shrink-0 overflow-hidden rounded-lg border border-border bg-card">
                <div
                  ref={logContainerRef}
                  className="bg-terminal h-32 overflow-x-hidden overflow-y-auto overscroll-contain p-3"
                >
                  <div className="space-y-1 font-mono text-[10px] leading-relaxed text-zinc-400">
                    {logLines.length === 0 ? (
                      <p className="text-muted-foreground">Waiting for EAS output…</p>
                    ) : (
                      logLines.map((line, index) => (
                        <p
                          key={`${index}-${line.slice(0, 24)}`}
                          className="break-all [overflow-wrap:anywhere]"
                        >
                          {line}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <p className="shrink-0 text-[11px] text-muted-foreground">
                EAS builds on Expo servers, then submits to the store. This can take 15–30+ minutes.
              </p>
            </div>
          )}

          {step === "success" && store && (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3 mt-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div>
                  <p className="text-sm font-medium text-success">Build submitted</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your build was submitted to {getDeployStoreLabel(store)}
                    {elapsedSeconds > 0 ? ` in ${formatElapsed(elapsedSeconds)}` : ""}. Check EAS
                    and your store console for processing status.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={handleClose}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    useAppStore.getState().setActiveScreen("builds");
                    handleClose();
                  }}
                >
                  View builds
                </Button>
              </div>
            </>
          )}

          {step === "failed" && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 pb-1">
              <div className="flex shrink-0 items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-destructive">{failureSummary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Scroll the build log below for details.
                  </p>
                </div>
              </div>

              {failureLogs.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
                  <ScrollArea className="h-full max-h-[min(42vh,320px)] min-h-[10rem]">
                    <div ref={logContainerRef} className="bg-terminal p-3">
                      <div className="space-y-1 font-mono text-[10px] leading-relaxed text-zinc-400">
                        {failureLogs.map((line, index) => (
                          <p
                            key={`${index}-${line.slice(0, 24)}`}
                            className="break-all [overflow-wrap:anywhere]"
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No build log captured.</p>
              )}
            </div>
          )}
        </CardContent>
        {dialogFooter}
      </Card>
    </div>
  );
}
