import { Card, CardContent, CardHeader, CardTitle, Badge, Progress } from "@hangar/ui";
import { useAppStore } from "@/lib/store";
import { ScoreRing, EmptyProject } from "@/components/shared";
import { Apple, Smartphone, CheckCircle2, Circle, AlertTriangle, Minus } from "lucide-react";

const STATUS_ICON = {
  done: CheckCircle2,
  pending: Circle,
  warning: AlertTriangle,
  na: Minus,
};

const STATUS_COLOR = {
  done: "text-success",
  pending: "text-muted-foreground",
  warning: "text-warning",
  na: "text-muted-foreground",
};

export function ReleasesScreen() {
  const projectPath = useAppStore((s) => s.projectPath);
  const easData = useAppStore((s) => s.easData);
  const scanResult = useAppStore((s) => s.scanResult);

  if (!projectPath) return <EmptyProject />;

  const release = easData?.releaseReadiness ?? {
    score: 0,
    version: scanResult?.sdkVersion ?? "—",
    buildNumber: "—",
    profile: "production",
    environment: "production",
    channel: "production",
    commit: "—",
    checklist: [],
  };

  const storeReleases = easData?.storeReleases ?? [];
  const latestIos = storeReleases.find((r) => r.platform === "ios");
  const latestAndroid = storeReleases.find((r) => r.platform === "android");

  const doneCount = release.checklist.filter((c) => c.status === "done").length;
  const progress = release.checklist.length > 0 ? (doneCount / release.checklist.length) * 100 : 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Release Readiness</h2>
        <p className="text-sm text-muted-foreground">
          v{release.version} ({release.buildNumber}) · {release.profile} · {release.channel}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="gradient-border glow-green">
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <ScoreRing score={release.score} size={88} />
            <p className="text-sm font-medium">Release Readiness Score</p>
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-muted-foreground">
              {doneCount}/{release.checklist.length} checklist items complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Release Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["Version", release.version],
              ["Build Number", release.buildNumber],
              ["Profile", release.profile],
              ["Environment", release.environment],
              ["Channel", release.channel],
              ["Commit", release.commit],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono text-xs">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {release.checklist.length === 0 ? (
              <p className="text-sm text-muted-foreground">Open a project to generate release checklist.</p>
            ) : (
              release.checklist.map((item) => {
                const Icon = STATUS_ICON[item.status];
                return (
                  <div key={item.id} className="flex items-start gap-2">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_COLOR[item.status]}`} />
                    <div>
                      <p className="text-xs font-medium">{item.label}</p>
                      {item.description && (
                        <p className="text-[10px] text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Apple className="h-4 w-4" />
              iOS Release
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latest Build</span>
              <span className="font-mono text-xs">{latestIos?.id.slice(0, 12) ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={latestIos ? "success" : "secondary"}>
                {latestIos ? "Build finished" : "No production build"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{latestIos?.date ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Android Release
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latest Build</span>
              <span className="font-mono text-xs">{latestAndroid?.id.slice(0, 12) ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={latestAndroid ? "success" : "secondary"}>
                {latestAndroid ? "Build finished" : "No production build"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{latestAndroid?.date ?? "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Production Builds</CardTitle>
        </CardHeader>
        <CardContent>
          {storeReleases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No finished production builds found. Store submission status requires eas submit (not available via list API).
            </p>
          ) : (
            <div className="space-y-2">
              {storeReleases.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium font-mono">{r.id.slice(0, 12)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{r.platform}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="success">{r.status}</Badge>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{r.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
