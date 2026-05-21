import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@expopilot/ui";
import { getExpoSdkStatus } from "@expopilot/core";
import {
  Activity,
  Hammer,
  RefreshCw,
  Package,
  Settings2,
  GitBranch,
  Rocket,
} from "lucide-react";
import { useAppStore, getActionableIssues, relativeTime } from "@/lib/store";
import { SeverityBadge, SeverityIcon, ScoreRing, EmptyProject } from "@/components/shared";
import { NextActionHero } from "@/components/NextActionHero";
import { isTauri } from "@/lib/platform";

export function DashboardScreen() {
  const scanResult = useAppStore((s) => s.scanResult);
  const projectPath = useAppStore((s) => s.projectPath);
  const healthHistory = useAppStore((s) => s.healthHistory);
  const easData = useAppStore((s) => s.easData);

  if (!projectPath) return <EmptyProject />;

  const score = scanResult?.healthScore ?? 0;
  const issues = scanResult?.issues ?? [];
  const warnings = getActionableIssues(issues).filter((i) => i.severity === "warning");
  const critical = getActionableIssues(issues).filter((i) => i.severity === "critical");
  const passed = issues.filter((i) => i.severity === "passed");

  const latestBuild = easData?.builds[0];
  const compatStatus = easData?.compatibility.compatibility.status;
  const releaseScore = easData?.releaseReadiness.score ?? score;
  const sdkStatus = getExpoSdkStatus(scanResult?.sdkVersion);

  const trendData = healthHistory.slice(-7).map((h) => ({
    date: new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: h.score,
  }));

  const summaryCards = [
    {
      label: "Health Score",
      value: `${score}`,
      sub: "/ 100",
      icon: Activity,
      accent: score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive",
    },
    {
      label: "Last Build",
      value: latestBuild ? relativeTime(latestBuild.startedAt) : "—",
      sub: latestBuild ? `${latestBuild.profile} · ${latestBuild.platform}` : "No builds",
      icon: Hammer,
    },
    {
      label: "Update Compatibility",
      value: compatStatus === "compatible" ? "Compatible" : compatStatus === "not-compatible" ? "Mismatch" : "Unknown",
      sub: easData?.compatibility.runtimeVersion ?? "—",
      icon: RefreshCw,
      accent: compatStatus === "compatible" ? "text-success" : "text-muted-foreground",
    },
    {
      label: "SDK Version",
      value: sdkStatus.currentMajor?.toString() ?? "—",
      sub: scanResult?.sdkVersion ? `expo@${scanResult.sdkVersion}` : "Not detected",
      warning:
        sdkStatus.isDetected && !sdkStatus.isLatest
          ? `Not on latest - SDK ${sdkStatus.latestMajor} available`
          : undefined,
      icon: Package,
      accent: !sdkStatus.isDetected
        ? undefined
        : sdkStatus.isLatest
          ? "text-success"
          : "text-warning",
    },
    {
      label: "EAS Build",
      value: scanResult?.metadata.easBuildConfigured ? "Configured" : "Missing",
      sub: scanResult?.metadata.hasEasJson ? "eas.json found" : "No eas.json",
      icon: Settings2,
      accent: scanResult?.metadata.easBuildConfigured ? "text-success" : "text-warning",
    },
    {
      label: "Expo Router",
      value: scanResult?.metadata.expoRouterEnabled ? "Enabled" : "Off",
      sub: scanResult?.metadata.expoRouterEnabled ? "app/ detected" : "Not installed",
      icon: GitBranch,
      accent: scanResult?.metadata.expoRouterEnabled ? "text-primary" : "text-muted-foreground",
    },
  ];

  const recentBuilds = easData?.builds.slice(0, 4) ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Overview of {scanResult?.projectName ?? "your project"}
          {!isTauri() && " (web mode - open in Tauri for EAS integration)"}
        </p>
      </div>

      <NextActionHero />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <Card key={card.label} className="glow-blue">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">{card.label}</p>
                  <p className={`mt-1 text-lg font-bold ${card.accent ?? ""}`}>
                    {card.value}
                  </p>
                  {card.sub && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{card.sub}</p>
                  )}
                  {"warning" in card && card.warning && (
                    <p className="mt-1 text-[10px] font-medium leading-snug text-warning">
                      {card.warning}
                    </p>
                  )}
                </div>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Health Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#16161f",
                      border: "1px solid #27272f",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#3b82f6" fill="url(#scoreGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Scan your project to start tracking health over time.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="gradient-border glow-green">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-success" />
              Release Readiness
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <ScoreRing score={releaseScore} size={80} />
            <p className="text-center text-xs text-muted-foreground">
              {critical.length > 0
                ? `${critical.length} critical issue(s) blocking release`
                : warnings.length > 0
                  ? `${warnings.length} warning(s) to review`
                  : "Looking good - review checklist before shipping"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Warnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...critical, ...warnings].slice(0, 5).map((issue) => (
              <div
                key={issue.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3"
              >
                <SeverityIcon severity={issue.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{issue.title}</p>
                    <SeverityBadge severity={issue.severity} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{issue.description}</p>
                </div>
              </div>
            ))}
            {critical.length + warnings.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {passed.length} checks passed. No warnings detected.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Builds</CardTitle>
          </CardHeader>
          <CardContent>
            {recentBuilds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isTauri() ? "No EAS builds yet." : "EAS builds available in desktop app."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">ID</th>
                      <th className="pb-2 pr-3 font-medium">Platform</th>
                      <th className="pb-2 pr-3 font-medium">Profile</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBuilds.map((build) => (
                      <tr key={build.id} className="border-b border-border/50">
                        <td className="py-2 pr-3 font-mono text-[11px]">{build.id.slice(0, 8)}</td>
                        <td className="py-2 pr-3 capitalize">{build.platform}</td>
                        <td className="py-2 pr-3">{build.profile}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={
                              build.status === "finished"
                                ? "text-success"
                                : build.status === "errored"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }
                          >
                            {build.status}
                          </span>
                        </td>
                        <td className="py-2">{build.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
