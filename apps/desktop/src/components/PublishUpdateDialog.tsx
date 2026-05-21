import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  GitBranch,
  Loader2,
  Rocket,
  XCircle,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Progress,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@expopilot/ui";
import { useAppStore } from "@/lib/store";
import { publishEasUpdate } from "@/lib/eas-service";
import { notify } from "@/lib/notify";
import { checkGitStatus } from "@/lib/services";
import { isTauri } from "@/lib/platform";

type DialogStep = "checking" | "dirty" | "blocked" | "form" | "publishing" | "success" | "failed";

type PublishPhase = "starting" | "bundling" | "uploading" | "finishing";

interface PublishUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PUBLISH_STEPS: { id: PublishPhase | "done"; label: string }[] = [
  { id: "starting", label: "Starting" },
  { id: "bundling", label: "Bundling" },
  { id: "uploading", label: "Uploading" },
  { id: "finishing", label: "Publishing" },
  { id: "done", label: "Done" },
];

const PHASE_PROGRESS: Record<PublishPhase | "done", number> = {
  starting: 12,
  bundling: 45,
  uploading: 72,
  finishing: 92,
  done: 100,
};

function collectBranchOptions(
  environment: string,
  environments: { branch: string }[] | undefined,
  updates: { branch: string }[] | undefined,
): string[] {
  const fromProfiles = environments?.map((entry) => entry.branch).filter(Boolean) ?? [];
  const fromUpdates =
    updates?.map((entry) => entry.branch).filter((branch) => branch && branch !== "—") ?? [];
  const defaults = ["development", "preview", "production"];
  const merged = [...new Set([...fromProfiles, ...fromUpdates, ...defaults])];
  if (merged.includes(environment)) {
    return [environment, ...merged.filter((branch) => branch !== environment)];
  }
  return merged;
}

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

function detectPublishPhase(line: string): PublishPhase | null {
  const lower = line.toLowerCase();
  if (
    lower.includes("exporting") ||
    lower.includes("bundling") ||
    lower.includes("metro") ||
    lower.includes("expo export") ||
    lower.includes("computing project fingerprints")
  ) {
    return "bundling";
  }
  if (lower.includes("uploading") || lower.includes("uploaded") || lower.includes("asset")) {
    return "uploading";
  }
  if (
    lower.includes("published") ||
    lower.includes("update group") ||
    lower.includes("branch:") ||
    lower.includes("finished")
  ) {
    return "finishing";
  }
  return null;
}

function cleanLogLine(line: string): string {
  return line.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").trim();
}

function phaseIndex(phase: PublishPhase | "done"): number {
  return PUBLISH_STEPS.findIndex((step) => step.id === phase);
}

export function PublishUpdateDialog({ open, onOpenChange }: PublishUpdateDialogProps) {
  const projectPath = useAppStore((s) => s.projectPath);
  const settings = useAppStore((s) => s.settings);
  const environment = useAppStore((s) => s.environment);
  const easData = useAppStore((s) => s.easData);
  const easAuth = useAppStore((s) => s.easAuth);
  const refreshUpdatesAfterPublish = useAppStore((s) => s.refreshUpdatesAfterPublish);

  const [step, setStep] = useState<DialogStep>("checking");
  const [gitChanges, setGitChanges] = useState<string[]>([]);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [branch, setBranch] = useState(environment);
  const [message, setMessage] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("starting");
  const [statusLine, setStatusLine] = useState("Starting EAS update…");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const branchOptions = useMemo(
    () => collectBranchOptions(environment, easData?.environments, easData?.updates),
    [environment, easData?.environments, easData?.updates],
  );

  const resetState = useCallback(() => {
    setStep("checking");
    setGitChanges([]);
    setCheckError(null);
    setBranch(environment);
    setMessage("");
    setPublishError(null);
    setPublishPhase("starting");
    setStatusLine("Starting EAS update…");
    setLogLines([]);
    setElapsedSeconds(0);
  }, [environment]);

  const runPreflight = useCallback(async () => {
    if (!projectPath) {
      setCheckError("No project selected.");
      setStep("blocked");
      return;
    }

    if (!isTauri()) {
      setCheckError("Publishing requires the ExpoPilot desktop app.");
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
      setMessage(status.lastCommitMessage?.trim() ?? "");
      setStep("form");
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
      setStep("blocked");
    }
  }, [projectPath, easAuth?.state]);

  useEffect(() => {
    if (!open) return;
    resetState();
    void runPreflight();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && step !== "publishing") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, step, onOpenChange]);

  useEffect(() => {
    if (step !== "publishing") return;
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
    if (step === "publishing") return;
    onOpenChange(false);
  };

  const handlePublish = async () => {
    if (!projectPath || !message.trim()) return;

    flushSync(() => {
      setStep("publishing");
      setPublishError(null);
      setPublishPhase("starting");
      setStatusLine("Starting EAS update…");
      setLogLines([]);
      setElapsedSeconds(0);
    });

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    try {
      await publishEasUpdate(
        projectPath,
        branch,
        message,
        settings.easCliPath,
        (line, stream) => {
          const cleaned = cleanLogLine(line);
          if (!cleaned) return;

          const phase = detectPublishPhase(cleaned);
          if (phase) {
            setPublishPhase(phase);
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
        },
      );

      setPublishPhase("finishing");
      setStatusLine("Update published successfully.");
      setStep("success");
      void refreshUpdatesAfterPublish();
      void notify({
        title: "Update published",
        description: "EAS update is live - open Updates to check delivery.",
        variant: "success",
        action: { label: "Open Updates", onClick: "/updates" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPublishError(message);
      setStep("failed");
      void notify({
        title: "Publish failed",
        description: message,
        variant: "error",
        durationMs: 10_000,
      });
    }
  };

  const currentPhaseIndex = phaseIndex(publishPhase);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-default items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <Card
        className="flex max-h-[min(90vh,560px)] w-full max-w-lg flex-col overflow-hidden shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader className="shrink-0 border-b border-border/60 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-5 w-5 text-primary" />
            Publish EAS Update
          </CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
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
                    Commit or stash your changes before publishing an update.
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

          {step === "form" && (
            <div className="space-y-4 overflow-visible">
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3 mt-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-sm text-muted-foreground">
                  Git working tree is clean. Choose a branch and message to publish.
                </p>
              </div>

              <div className="relative z-30 space-y-2">
                <Label>Branch</Label>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branchOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        <span className="flex items-center gap-2 capitalize">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          {option}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Updates are published to an EAS branch. Match your build&apos;s channel branch.
                </p>
              </div>

              <div className="relative z-0 space-y-2">
                <Label htmlFor="publish-message">Message</Label>
                <textarea
                  id="publish-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Describe what changed in this update…"
                  rows={3}
                  className="flex w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground">
                  Pre-filled from your latest git commit. Edit before publishing if needed.
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Branch:</span>{" "}
                  <span className="capitalize">{branch}</span>
                </p>
                <p className="mt-1 truncate">
                  <span className="font-medium text-foreground">Message:</span>{" "}
                  {message.trim() || "—"}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handlePublish()} disabled={!message.trim()}>
                  Publish update
                </Button>
              </div>
            </div>
          )}

          {step === "publishing" && (
            <div className="flex flex-col gap-4 py-1">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Publishing to <span className="capitalize">{branch}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatElapsed(elapsedSeconds)} elapsed
                  </p>
                </div>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              </div>

              <div className="shrink-0">
                <Progress value={PHASE_PROGRESS[publishPhase]} />
              </div>

              <div className="grid shrink-0 grid-cols-5 gap-1">
                {PUBLISH_STEPS.map((item, index) => {
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
                Bundling and uploading run locally via EAS CLI. This usually takes 1–3 minutes.
              </p>
            </div>
          )}

          {step === "success" && (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div>
                  <p className="text-sm font-medium text-success">Update published</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your update was published to the <span className="capitalize">{branch}</span> branch
                    {elapsedSeconds > 0 ? ` in ${formatElapsed(elapsedSeconds)}` : ""}.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={handleClose}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    useAppStore.getState().setActiveScreen("updates");
                    handleClose();
                  }}
                >
                  View updates
                </Button>
              </div>
            </>
          )}

          {step === "failed" && (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="whitespace-pre-wrap text-sm text-destructive">{publishError}</p>
              </div>
              {logLines.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="bg-terminal max-h-32 overflow-x-hidden overflow-y-auto overscroll-contain p-3">
                    <div className="space-y-1 font-mono text-[10px] text-zinc-400">
                      {logLines.slice(-12).map((line, index) => (
                        <p
                          key={`${index}-${line.slice(0, 24)}`}
                          className="break-all [overflow-wrap:anywhere]"
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={handleClose}>
                  Close
                </Button>
                <Button onClick={() => setStep("form")}>Try again</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
