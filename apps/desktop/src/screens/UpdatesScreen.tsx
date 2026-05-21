import { useMemo, useState } from "react";
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
import type { UpdateRecord } from "@expopilot/core";
import { useAppStore, relativeTime } from "@/lib/store";
import { EasLoginRequired } from "@/components/EasLoginRequired";
import { isTauri } from "@/lib/platform";
import { computeDeliveryByPlatform, type DeliveryStatus } from "@/lib/updates-summary";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  ChevronDown,
} from "lucide-react";

const TH =
  "px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const TD = "px-4 py-3 align-middle text-[13px]";

function formatPlatform(platform: UpdateRecord["platform"]): string {
  if (platform === "all") return "All";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function matchesEnvironment(update: UpdateRecord, environment: string): boolean {
  const env = environment.toLowerCase();
  return update.branch.toLowerCase() === env || update.channel.toLowerCase() === env;
}

export function UpdatesScreen() {
  const easData = useAppStore((s) => s.easData);
  const environment = useAppStore((s) => s.environment);
  const isLoadingEas = useAppStore((s) => s.isLoadingEas);
  const easError = useAppStore((s) => s.easError);
  const loadEasData = useAppStore((s) => s.loadEasData);

  const easAuth = useAppStore((s) => s.easAuth);
  const needsEasLogin =
    isTauri() && easAuth !== null && easAuth.state !== "logged-in" && easAuth.state !== "unavailable";

  const [showAllBranches, setShowAllBranches] = useState(false);

  const updates = easData?.updates ?? [];
  const builds = easData?.builds ?? [];
  const inspector = easData?.compatibility;
  const compat = inspector?.compatibility ?? {
    status: "unknown" as const,
    runtimeVersionMatch: false,
    channelMatch: false,
    branchMatch: false,
    platformMatch: false,
    rolloutStatus: "unknown" as const,
  };

  const delivery = useMemo(
    () => computeDeliveryByPlatform(builds, updates, environment),
    [builds, updates, environment],
  );

  const filteredUpdates = useMemo(() => {
    if (showAllBranches) return updates;
    return updates.filter((u) => matchesEnvironment(u, environment));
  }, [updates, environment, showAllBranches]);

  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of updates) {
      const key = u.branch || u.channel || "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [updates]);

  const matrix = [
    { label: "Runtime version match", ok: compat.runtimeVersionMatch, hint: "Build and update share the same runtime version" },
    { label: "Channel / branch match", ok: compat.channelMatch, hint: `Update published to ${environment} branch` },
    { label: "Branch configured", ok: compat.branchMatch, hint: "Update has a valid branch assigned" },
    { label: "Platform match", ok: compat.platformMatch, hint: "Update targets the build platform" },
    { label: "Rollout active", ok: compat.rolloutStatus === "active", hint: "Update group is actively rolled out" },
  ];

  return (
    <div className="flex min-h-full flex-col gap-5 p-6">
      <header className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">EAS Updates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTauri() ? "Live data from eas update:list --all" : "EAS requires the desktop app"}
          </p>
        </div>
        {isTauri() && (
          <Button variant="secondary" size="sm" onClick={() => loadEasData()} disabled={isLoadingEas}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoadingEas ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </header>

      {needsEasLogin ? (
        <EasLoginRequired />
      ) : (
        <>
          {easError && (
            <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {easError}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {delivery.map((d) => (
              <PlatformDeliveryCard key={d.platform} delivery={d} />
            ))}
          </div>

          <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "Latest build",
                value: inspector?.productionBuild?.id.slice(0, 12) ?? "—",
                mono: true,
              },
              {
                label: "Latest update",
                value: inspector?.latestUpdate?.message ?? "—",
              },
              {
                label: "Runtime version",
                value: inspector?.runtimeVersion ?? inspector?.productionBuild?.runtimeVersion ?? "—",
                mono: true,
              },
              { label: "Branch", value: inspector?.branch ?? "—" },
              {
                label: "Total updates",
                value: String(updates.length),
              },
              {
                label: "Last published",
                value: inspector?.lastPublished ? relativeTime(inspector.lastPublished) : "—",
              },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-border/60 bg-card px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </p>
                <p
                  className={`mt-1 truncate text-sm font-semibold ${card.mono ? "font-mono text-xs" : ""}`}
                  title={card.value}
                >
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <details className="group rounded-xl border border-border bg-card/40 open:bg-card">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium">
              <span className="flex items-center gap-2 text-muted-foreground">
                Why? Show technical compatibility checks
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-border/60 p-4">
              {matrix.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                  </div>
                  {item.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                </div>
              ))}
            </div>
          </details>

          <div className="grid min-h-[280px] flex-1 gap-4 lg:grid-cols-3">
            <Card className="flex min-h-0 flex-col overflow-hidden lg:col-span-3">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HelpCircle className="h-4 w-4" />
                  Troubleshooting
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-y-auto p-4 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Why isn&apos;t my update showing?</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4">
                  <li>Runtime version mismatch between build and update</li>
                  <li>Update published to wrong branch (check vs top bar environment)</li>
                  <li>App opened before update finished publishing</li>
                  <li>Development builds don&apos;t receive OTA updates</li>
                  <li>Native code changed - requires a new build</li>
                </ul>
                {Object.keys(branchCounts).length > 0 && (
                  <div className="mt-4 border-t border-border/40 pt-3">
                    <p className="font-medium text-foreground">Updates by branch</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(branchCounts).map(([branch, count]) => (
                        <Badge
                          key={branch}
                          variant={branch.toLowerCase() === environment ? "default" : "outline"}
                          className="font-normal capitalize"
                        >
                          {branch} · {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="shrink-0 overflow-hidden">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-base">Recent Updates</CardTitle>
                  <CardDescription className="mt-1">
                    {showAllBranches
                      ? `All branches · ${updates.length} updates`
                      : `${environment} branch · ${filteredUpdates.length} of ${updates.length} updates`}
                  </CardDescription>
                </div>
                <Button
                  variant={showAllBranches ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => setShowAllBranches((v) => !v)}
                >
                  {showAllBranches ? "Environment only" : "All branches"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredUpdates.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  {isLoadingEas
                    ? "Loading updates from EAS..."
                    : updates.length === 0
                      ? "No updates found. Run eas update or check that you're logged in."
                      : `No updates on the ${environment} branch. Try "All branches" or switch environment in the top bar.`}
                </p>
              ) : (
                <ScrollArea className="max-h-[min(44vh,440px)]">
                  <div className="min-w-[720px] pb-1">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 z-10 border-b border-border bg-card">
                        <tr>
                          <th className={`${TH} min-w-[220px]`}>Message</th>
                          <th className={`${TH} w-[100px]`}>Branch</th>
                          <th className={`${TH} w-[88px]`}>Runtime</th>
                          <th className={`${TH} w-[96px]`}>Platform</th>
                          <th className={`${TH} w-[128px]`}>Group ID</th>
                          <th className={`${TH} w-[96px] text-right`}>Published</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUpdates.map((update, index) => (
                          <tr
                            key={update.id}
                            className={`border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/40 ${
                              index === 0 ? "bg-muted/20" : ""
                            }`}
                          >
                            <td className={TD}>
                              <p className="truncate font-medium text-foreground" title={update.message}>
                                {update.message}
                              </p>
                            </td>
                            <td className={TD}>
                              <Badge variant="outline" className="font-normal capitalize">
                                {update.branch}
                              </Badge>
                            </td>
                            <td className={TD}>
                              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                {update.runtimeVersion}
                              </span>
                            </td>
                            <td className={TD}>
                              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-xs">{formatPlatform(update.platform)}</span>
                              </span>
                            </td>
                            <td className={TD}>
                              <span
                                className="block truncate font-mono text-[11px] text-muted-foreground"
                                title={update.groupId}
                              >
                                {update.groupId?.slice(0, 12) ?? "—"}
                              </span>
                            </td>
                            <td className={`${TD} text-right text-xs tabular-nums text-muted-foreground`}>
                              {relativeTime(update.publishedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const DELIVERY_STYLE: Record<DeliveryStatus, { border: string; bg: string; icon: typeof CheckCircle2; iconClass: string }> = {
  "will-deliver": {
    border: "border-success/30",
    bg: "bg-success/10",
    icon: CheckCircle2,
    iconClass: "text-success",
  },
  "wont-deliver": {
    border: "border-destructive/30",
    bg: "bg-destructive/10",
    icon: XCircle,
    iconClass: "text-destructive",
  },
  "no-build": {
    border: "border-border",
    bg: "bg-secondary/40",
    icon: Smartphone,
    iconClass: "text-muted-foreground",
  },
  "no-update": {
    border: "border-warning/30",
    bg: "bg-warning/10",
    icon: AlertTriangle,
    iconClass: "text-warning",
  },
};

function PlatformDeliveryCard({
  delivery,
}: {
  delivery: ReturnType<typeof computeDeliveryByPlatform>[number];
}) {
  const style = DELIVERY_STYLE[delivery.status];
  const Icon = style.icon;
  return (
    <div className={`rounded-xl border p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {delivery.platform === "ios" ? "iOS" : "Android"}
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug">{delivery.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{delivery.detail}</p>
          {(delivery.buildRuntime || delivery.updateRuntime) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              {delivery.buildRuntime && (
                <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-muted-foreground">
                  build: {delivery.buildRuntime}
                </span>
              )}
              {delivery.updateRuntime && (
                <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-muted-foreground">
                  update: {delivery.updateRuntime}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
