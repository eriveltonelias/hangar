import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from "@hangar/ui";
import type { ExpoDoctorResult } from "@hangar/core";
import { useAppStore } from "@/lib/store";
import { isTauri } from "@/lib/platform";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Stethoscope,
  XCircle,
  AlertTriangle,
} from "lucide-react";

function statusBadge(result: ExpoDoctorResult) {
  if (result.status === "success") {
    return (
      <Badge variant="success" className="font-normal">
        {result.passed}/{result.total} passed
      </Badge>
    );
  }
  if (result.status === "failed") {
    return (
      <Badge variant="warning" className="font-normal">
        {result.passed}/{result.total} passed
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="font-normal">
      Could not run
    </Badge>
  );
}

export function ExpoDoctorSection() {
  const expoDoctor = useAppStore((s) => s.expoDoctor);
  const isRunningExpoDoctor = useAppStore((s) => s.isRunningExpoDoctor);
  const isScanning = useAppStore((s) => s.isScanning);
  const runExpoDoctorCheck = useAppStore((s) => s.runExpoDoctorCheck);

  const failedChecks = useMemo(
    () => expoDoctor?.checks.filter((check) => !check.passed) ?? [],
    [expoDoctor?.checks],
  );

  if (!isTauri()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4" />
            Expo Doctor
          </CardTitle>
          <CardDescription>Runs `npx expo-doctor` against your project</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Expo Doctor checks require the Hangar desktop app.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope className="h-4 w-4" />
              Expo Doctor
            </CardTitle>
            <CardDescription className="mt-1">
              Official Expo SDK checks via `npx expo-doctor`
              {expoDoctor?.ranAt
                ? ` · ${new Date(expoDoctor.ranAt).toLocaleString()}`
                : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {expoDoctor && statusBadge(expoDoctor)}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runExpoDoctorCheck()}
              disabled={isRunningExpoDoctor || isScanning}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isRunningExpoDoctor ? "animate-spin" : ""}`}
              />
              {isRunningExpoDoctor ? "Running…" : "Re-run"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isRunningExpoDoctor && !expoDoctor ? (
          <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Running expo-doctor…
          </div>
        ) : !expoDoctor ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Open or scan a project to run Expo Doctor checks.
          </p>
        ) : expoDoctor.status === "error" ? (
          <div className="space-y-3 px-5 py-5">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">Expo Doctor failed to run</p>
                <p className="mt-1 text-xs text-muted-foreground">{expoDoctor.error}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Make sure dependencies are installed (`npm install`) and run from your Expo app root.
            </p>
          </div>
        ) : expoDoctor.status === "success" ? (
          <div className="flex items-start gap-3 px-5 py-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-medium text-success">All checks passed</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {expoDoctor.total} Expo Doctor checks passed with no issues detected.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {failedChecks.map((check) => (
              <div key={check.id} className="space-y-2 px-5 py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{check.title}</p>
                    {check.details && (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-secondary/20 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                        {check.details}
                      </pre>
                    )}
                    {check.advice && (
                      <p className="mt-2 text-xs text-success">{check.advice}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
