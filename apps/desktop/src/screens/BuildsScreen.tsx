import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  ScrollArea,
  Button,
} from "@expopilot/ui";
import type { BuildRecord } from "@expopilot/core";
import { parseBuildLog } from "@expopilot/core";
import { useAppStore, relativeTime } from "@/lib/store";
import { fetchBuildLog } from "@/lib/eas-service";
import { getCachedBuildLog, setCachedBuildLog } from "@/lib/build-log-cache";
import { VerifyBeforeBuildSection } from "@/components/VerifyBeforeBuildSection";
import { BuildLogViewer } from "@/components/BuildLogViewer";
import { EasLoginRequired } from "@/components/EasLoginRequired";
import { isTauri } from "@/lib/platform";
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";

const STATUS_CONFIG = {
  finished: { icon: CheckCircle2, label: "Finished", variant: "success" as const },
  errored: { icon: XCircle, label: "Errored", variant: "destructive" as const },
  "in-progress": { icon: Clock, label: "In progress", variant: "warning" as const },
  "in-queue": { icon: Clock, label: "Queued", variant: "secondary" as const },
  canceled: { icon: AlertCircle, label: "Canceled", variant: "secondary" as const },
};

const TH =
  "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const TD = "px-3 py-2.5 align-middle text-[13px]";

function isLogLoadError(text: string | null | undefined): text is string {
  return Boolean(text?.startsWith("Failed to load build log:"));
}

function BuildStatusBadge({ status }: { status: BuildRecord["status"] }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG["in-queue"];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1 pl-1.5 font-normal capitalize">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function BuildDetailLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-10">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function BuildsScreen() {
  const projectPath = useAppStore((s) => s.projectPath);
  const settings = useAppStore((s) => s.settings);
  const easData = useAppStore((s) => s.easData);
  const isRefreshingBuilds = useAppStore((s) => s.isRefreshingBuilds);
  const easError = useAppStore((s) => s.easError);
  const refreshBuilds = useAppStore((s) => s.refreshBuilds);

  const easAuth = useAppStore((s) => s.easAuth);
  const needsEasLogin =
    isTauri() && easAuth !== null && easAuth.state !== "logged-in" && easAuth.state !== "unavailable";

  const builds = easData?.builds ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState<string | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);

  const selected = selectedId ? builds.find((b) => b.id === selectedId) : undefined;
  const logLoadError = isLogLoadError(buildLog) ? buildLog : null;
  const logText =
    loadingLog || !selected
      ? null
      : logLoadError
        ? null
        : buildLog ?? selected.log ?? null;
  const explanation = useMemo(
    () => (logText ? parseBuildLog(logText) : null),
    [logText],
  );

  const selectBuild = (buildId: string) => {
    setSelectedId(buildId);
    if (!projectPath || !isTauri()) return;

    const cached = getCachedBuildLog(projectPath, buildId);
    if (cached) {
      setBuildLog(cached);
      setLoadingLog(false);
      return;
    }

    setBuildLog(null);
    setLoadingLog(true);
  };

  useEffect(() => {
    if (!projectPath || !selectedId || !isTauri()) {
      setBuildLog(null);
      setLoadingLog(false);
      return;
    }

    const buildId = selectedId;
    const cached = getCachedBuildLog(projectPath, buildId);
    if (cached) {
      setBuildLog(cached);
      setLoadingLog(false);
      return;
    }

    let cancelled = false;
    setLoadingLog(true);
    setBuildLog(null);

    fetchBuildLog(projectPath, buildId, settings.easCliPath)
      .then((log) => {
        if (cancelled) return;
        setCachedBuildLog(projectPath, buildId, log);
        setBuildLog(log);
      })
      .finally(() => {
        if (!cancelled) setLoadingLog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath, selectedId, settings.easCliPath]);

  return (
    <div className="flex min-h-full flex-col gap-5 p-6">
      <header className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Builds</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTauri() ? "Live data from eas build:list" : "EAS requires the desktop app"}
          </p>
        </div>
        {isTauri() && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refreshBuilds()}
            disabled={isRefreshingBuilds}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshingBuilds ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </header>

      {easError && !needsEasLogin && (
        <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {easError}
        </div>
      )}

      {!needsEasLogin && <VerifyBeforeBuildSection />}

      {needsEasLogin ? (
        <EasLoginRequired />
      ) : (
        <Card className="shrink-0 overflow-hidden">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Recent Builds</CardTitle>
                <CardDescription className="mt-1">
                  {builds.length > 0
                    ? `${builds.length} build${builds.length === 1 ? "" : "s"} from EAS`
                    : "No builds loaded yet"}
                </CardDescription>
              </div>
              {builds.length > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {builds.filter((b) => b.status === "finished").length} passed ·{" "}
                  {builds.filter((b) => b.status === "errored").length} failed
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {builds.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {isRefreshingBuilds
                  ? "Loading builds from EAS..."
                  : easError
                    ? "Could not load builds from EAS. See the error above for details."
                    : "No builds found. Run eas build or check that you're logged in."}
              </p>
            ) : (
              <ScrollArea className="max-h-[min(40vh,400px)]">
                <table className="w-full table-fixed border-collapse">
                  <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                    <tr className="border-b border-border">
                      <th className={`${TH} w-[128px]`}>Build ID</th>
                      <th className={`${TH} w-[72px]`}>Platform</th>
                      <th className={`${TH} w-[96px]`}>Profile</th>
                      <th className={`${TH} w-[96px]`}>Branch</th>
                      <th className={`${TH} w-[72px]`}>Commit</th>
                      <th className={`${TH} w-[80px] text-right`}>Duration</th>
                      <th className={`${TH} w-[112px]`}>Status</th>
                      <th className={`${TH} w-[80px] text-right`}>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builds.map((build) => {
                      const isSelected = selectedId === build.id;
                      return (
                        <tr
                          key={build.id}
                          onClick={() => selectBuild(build.id)}
                          className={`cursor-pointer border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/40 ${
                            isSelected
                              ? "border-l-2 border-l-primary bg-primary/[0.06] hover:bg-primary/[0.08]"
                              : "border-l-2 border-l-transparent"
                          }`}
                        >
                          <td className={TD} title={build.id}>
                            <span className="font-mono text-[11px] text-foreground/90">
                              {build.id.slice(0, 12)}
                            </span>
                          </td>
                          <td className={TD}>
                            <span className="capitalize text-muted-foreground">{build.platform}</span>
                          </td>
                          <td className={`${TD} truncate`} title={build.profile}>
                            {build.profile}
                          </td>
                          <td className={`${TD} truncate text-muted-foreground`} title={build.branch}>
                            {build.branch}
                          </td>
                          <td className={TD}>
                            <span className="font-mono text-[11px] text-muted-foreground">{build.commit}</span>
                          </td>
                          <td className={`${TD} text-right tabular-nums text-muted-foreground`}>
                            {build.duration}
                          </td>
                          <td className={TD}>
                            <BuildStatusBadge status={build.status} />
                          </td>
                          <td className={`${TD} text-right text-xs text-muted-foreground`}>
                            {relativeTime(build.startedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {selected && !needsEasLogin ? (
        <div className="grid min-h-[300px] flex-1 gap-4 lg:grid-cols-2">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0 border-b border-border/60 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">Build Log</CardTitle>
                  <CardDescription className="mt-1 truncate font-mono text-[11px]">
                    {selected.id}
                  </CardDescription>
                </div>
                <BuildStatusBadge status={selected.status} />
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              {loadingLog ? (
                <BuildDetailLoading message="Fetching build log from EAS…" />
              ) : logLoadError ? (
                <ScrollArea className="min-h-[260px] flex-1 bg-[#0a0a0f]">
                  <pre className="whitespace-pre-wrap p-5 font-mono text-[11px] leading-relaxed text-red-300">
                    {logLoadError.replace("Failed to load build log: ", "")}
                  </pre>
                </ScrollArea>
              ) : logText ? (
                <BuildLogViewer text={logText} />
              ) : (
                <ScrollArea className="min-h-[260px] flex-1 bg-[#0a0a0f]">
                  <pre className="whitespace-pre-wrap p-5 font-mono text-[11px] leading-relaxed text-zinc-300">
                    Build completed successfully.{"\n\n"}No errors in log output.
                  </pre>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0 border-b border-border/60 pb-4">
              <CardTitle className="text-base">Issue Explanation</CardTitle>
              <CardDescription className="mt-1">
                Automated analysis of known build failure patterns
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-5">
              {loadingLog ? (
                <BuildDetailLoading message="Analyzing build log…" />
              ) : logLoadError ? (
                <EmptyExplanation
                  icon={AlertCircle}
                  title="Log unavailable"
                  description="Could not load the build log. Try selecting the build again or refresh the builds list."
                />
              ) : explanation ? (
                <div className="space-y-5">
                  <ExplanationBlock label="Root Cause" tone="destructive" text={explanation.rootCause} />
                  <ExplanationBlock label="Suggested Fix" tone="success" text={explanation.suggestedFix} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Affected Files
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {explanation.affectedFiles.map((f) => (
                        <Badge key={f} variant="outline" className="font-mono text-[10px] font-normal">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Next Actions
                    </p>
                    <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm leading-relaxed text-muted-foreground">
                      {explanation.nextActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : selected.status === "errored" ? (
                <EmptyExplanation
                  icon={Sparkles}
                  title="No known pattern"
                  description="This build failed, but no known error pattern was detected. Review the build log for details."
                />
              ) : (
                <EmptyExplanation
                  icon={CheckCircle2}
                  title="No issues found"
                  description="This build completed without errors. Select a failed build to see explanations."
                  tone="success"
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : builds.length > 0 && !needsEasLogin ? (
        <Card className="shrink-0 border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a build above to view its log and failure analysis.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ExplanationBlock({
  label,
  tone,
  text,
}: {
  label: string;
  tone: "destructive" | "success";
  text: string;
}) {
  return (
    <div>
      <p
        className={`text-[10px] font-semibold uppercase tracking-wider ${
          tone === "destructive" ? "text-destructive" : "text-success"
        }`}
      >
        {label}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function EmptyExplanation({
  icon: Icon,
  title,
  description,
  tone = "muted",
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone?: "muted" | "success";
}) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
      <div
        className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${
          tone === "success" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
