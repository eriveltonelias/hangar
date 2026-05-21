import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@expopilot/ui";
import type { BuildVerificationCheck } from "@expopilot/core";
import { useAppStore } from "@/lib/store";
import { isTauri } from "@/lib/platform";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Hammer,
  Loader2,
  RefreshCw,
} from "lucide-react";

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    label: "Pass",
    badge: "success" as const,
    row: "text-success",
  },
  fail: {
    icon: AlertCircle,
    label: "Fail",
    badge: "destructive" as const,
    row: "text-destructive",
  },
  warn: {
    icon: AlertTriangle,
    label: "Warn",
    badge: "warning" as const,
    row: "text-warning",
  },
  skip: {
    icon: Circle,
    label: "Skip",
    badge: "secondary" as const,
    row: "text-muted-foreground",
  },
};

function VerificationRow({ check }: { check: BuildVerificationCheck }) {
  const config = STATUS_CONFIG[check.status];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.row}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{check.label}</p>
          <Badge variant={config.badge} className="font-normal">
            {config.label}
          </Badge>
        </div>
        {check.description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.description}</p>
        )}
      </div>
    </div>
  );
}

export function VerifyBeforeBuildSection() {
  const buildVerification = useAppStore((s) => s.buildVerification);
  const isVerifyingBuild = useAppStore((s) => s.isVerifyingBuild);
  const verifyBeforeBuild = useAppStore((s) => s.verifyBeforeBuild);
  const projectPath = useAppStore((s) => s.projectPath);

  if (!isTauri() || !projectPath) return null;

  const failCount = buildVerification?.checks.filter((check) => check.status === "fail").length ?? 0;
  const warnCount = buildVerification?.checks.filter((check) => check.status === "warn").length ?? 0;

  return (
    <Card className={buildVerification?.canBuild ? "border-success/20" : "border-warning/30"}>
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hammer className="h-4 w-4" />
              Verify before build
            </CardTitle>
            <CardDescription className="mt-1">
              Runs local scan, `expo config`, Expo Doctor, and git checks before `eas build`
              {buildVerification?.ranAt
                ? ` · ${new Date(buildVerification.ranAt).toLocaleString()}`
                : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {buildVerification && (
              <Badge
                variant={buildVerification.canBuild ? "success" : "destructive"}
                className="font-normal"
              >
                {buildVerification.canBuild ? "Ready to build" : `${failCount} blocker(s)`}
              </Badge>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void verifyBeforeBuild()}
              disabled={isVerifyingBuild}
            >
              {isVerifyingBuild ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              {isVerifyingBuild ? "Verifying…" : buildVerification ? "Re-verify" : "Verify"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isVerifyingBuild && !buildVerification ? (
          <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Running project scan, expo config, Expo Doctor, and git checks…
          </div>
        ) : !buildVerification ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Catch config plugin errors, Firebase package mismatches, and dependency issues before
            starting an EAS build.
          </p>
        ) : (
          <>
            {!buildVerification.canBuild && (
              <div className="border-b border-destructive/20 bg-destructive/10 px-5 py-3 text-xs text-destructive">
                Fix {failCount} blocking issue{failCount === 1 ? "" : "s"} before running{" "}
                <span className="font-mono">eas build</span>.
              </div>
            )}
            {buildVerification.canBuild && warnCount > 0 && (
              <div className="border-b border-warning/20 bg-warning/10 px-5 py-3 text-xs text-warning">
                {warnCount} warning{warnCount === 1 ? "" : "s"} - you can build, but review before
                shipping.
              </div>
            )}
            <div className="divide-y divide-border/60">
              {buildVerification.checks.map((check) => (
                <VerificationRow key={check.id} check={check} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
