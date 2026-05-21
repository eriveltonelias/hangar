import { useMemo } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from "@hangar/ui";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Minus,
  Package,
  RefreshCw,
  Rocket,
} from "lucide-react";
import {
  categoryLabel,
  computeBundleDelta,
  formatBytes,
  type BundleCategoryStat,
  type BundleSizeReport,
} from "@hangar/core";
import { useAppStore } from "@/lib/store";
import { EmptyProject } from "@/components/shared";
import { revealInFileManagerWithFeedback } from "@/lib/file-actions";
import { isTauri } from "@/lib/platform";

const CATEGORY_COLOR: Record<BundleCategoryStat["category"], string> = {
  javascript: "bg-amber-400",
  images: "bg-sky-400",
  fonts: "bg-violet-400",
  media: "bg-pink-400",
  data: "bg-emerald-400",
  other: "bg-zinc-500",
};

export function BundleScreen() {
  const projectPath = useAppStore((s) => s.projectPath);
  const bundle = useAppStore((s) => s.bundle);
  const history = useAppStore((s) => s.bundleHistory);
  const isScanning = useAppStore((s) => s.isScanningBundle);
  const isExporting = useAppStore((s) => s.isExportingBundle);
  const scanBundle = useAppStore((s) => s.scanBundle);
  const runExpoExport = useAppStore((s) => s.runExpoExport);

  if (!projectPath) return <EmptyProject />;

  const trend = useMemo(
    () =>
      history.slice(-30).map((h) => ({
        date: new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        bytes: h.totalBytes,
        bytesLabel: formatBytes(h.totalBytes),
      })),
    [history],
  );

  const delta = useMemo(() => {
    if (history.length < 2) return null;
    const prev = history[history.length - 2];
    const curr = history[history.length - 1];
    return computeBundleDelta(prev.totalBytes, curr.totalBytes);
  }, [history]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Bundle size</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How big the app gets shipped to a user&apos;s device. Measured from your last{" "}
            <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[11px]">expo export</code>{" "}
            output.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void scanBundle()}
            disabled={isScanning || isExporting}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
            Rescan
          </Button>
          {isTauri() && (
            <Button
              size="sm"
              onClick={() => void runExpoExport()}
              disabled={isScanning || isExporting}
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rocket className="mr-2 h-3.5 w-3.5" />
              )}
              {isExporting ? "Exporting…" : "Run expo export"}
            </Button>
          )}
        </div>
      </header>

      {!bundle && !isScanning ? (
        <EmptyBundle />
      ) : !bundle && isScanning ? (
        <ScanningPlaceholder />
      ) : bundle ? (
        <>
          <SummaryCards bundle={bundle} delta={delta} />

          {trend.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Size over time</CardTitle>
                <CardDescription>Last {trend.length} measurements</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="bundleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => formatBytes(v as number)}
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#16161f",
                        border: "1px solid #27272f",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [formatBytes(value), "Size"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="bytes"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#bundleGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">By category</CardTitle>
                <CardDescription>Where the bytes live</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {bundle.byCategory.map((stat) => (
                  <div key={stat.category}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{categoryLabel(stat.category)}</span>
                      <span className="text-muted-foreground">
                        {formatBytes(stat.bytes)} · {stat.fileCount} file
                        {stat.fileCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full ${CATEGORY_COLOR[stat.category]}`}
                        style={{ width: `${Math.max(2, stat.share * 100).toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">Largest files</CardTitle>
                  <CardDescription>Tap a path to reveal in your file manager</CardDescription>
                </div>
                <Badge variant="secondary" className="font-normal">
                  Top {bundle.topFiles.length} of {bundle.fileCount}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {bundle.topFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_COLOR[file.category]}`}
                      title={categoryLabel(file.category)}
                    />
                    <button
                      type="button"
                      onClick={() => void revealInFileManagerWithFeedback(file.path)}
                      className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-foreground hover:underline"
                      title={`Reveal in file manager · ${file.path}`}
                    >
                      {file.relativePath}
                    </button>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatBytes(file.bytes)}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SummaryCards({
  bundle,
  delta,
}: {
  bundle: BundleSizeReport;
  delta: ReturnType<typeof computeBundleDelta> | null;
}) {
  const trendIcon = !delta
    ? Minus
    : delta.absoluteDelta > 0
      ? ArrowUpRight
      : delta.absoluteDelta < 0
        ? ArrowDownRight
        : Minus;
  const TrendIcon = trendIcon;
  const trendTone =
    !delta || delta.severity === "ok"
      ? "text-muted-foreground"
      : delta.severity === "critical"
        ? "text-destructive"
        : delta.severity === "warning"
          ? "text-warning"
          : "text-foreground";

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card>
        <CardContent className="flex items-start gap-3 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total size
            </p>
            <p className="mt-1 text-2xl font-bold">{formatBytes(bundle.totalBytes)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {bundle.fileCount.toLocaleString()} files in{" "}
              <span className="font-mono">{shortDir(bundle.bundleDir)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 p-5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${trendTone === "text-destructive" ? "bg-destructive/15" : trendTone === "text-warning" ? "bg-warning/15" : "bg-secondary"}`}>
            <TrendIcon className={`h-5 w-5 ${trendTone}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Since last measurement
            </p>
            {delta ? (
              <>
                <p className={`mt-1 text-2xl font-bold ${trendTone}`}>
                  {delta.absoluteDelta >= 0 ? "+" : ""}
                  {formatBytes(Math.abs(delta.absoluteDelta))}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {(delta.percentDelta * 100).toFixed(1)}% vs{" "}
                  {formatBytes(delta.previousBytes)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold text-muted-foreground">—</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Run a second measurement to start tracking trend.
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <RefreshCw className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Last measured
            </p>
            <p className="mt-1 text-sm font-semibold">
              {new Date(bundle.scannedAt).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Stale snapshots get replaced when you rescan.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyBundle() {
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 p-8 text-center">
        <Package className="mx-auto h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">No bundle output yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[11px]">npx expo export</code>{" "}
            (or click the button above) to generate a <code className="font-mono">dist/</code> folder, then Hangar
            will read its size and track it over time.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ScanningPlaceholder() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Reading bundle…
      </CardContent>
    </Card>
  );
}

function shortDir(dir: string): string {
  const i = dir.lastIndexOf("/");
  return i >= 0 ? dir.slice(i + 1) : dir;
}
