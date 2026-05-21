import { Badge, Button } from "@hangar/ui";
import type { Issue } from "@hangar/core";
import { AlertTriangle, CheckCircle2, Info, Plus, XCircle } from "lucide-react";
import { useAppStore } from "@/lib/store";

export function SeverityBadge({ severity }: { severity: Issue["severity"] }) {
  const config = {
    critical: { variant: "destructive" as const, label: "Critical" },
    warning: { variant: "warning" as const, label: "Warning" },
    info: { variant: "secondary" as const, label: "Info" },
    passed: { variant: "success" as const, label: "Passed" },
  };
  const { variant, label } = config[severity];
  return <Badge variant={variant}>{label}</Badge>;
}

export function SeverityIcon({ severity }: { severity: Issue["severity"] }) {
  switch (severity) {
    case "critical":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case "passed":
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    default:
      return <Info className="h-4 w-4 text-primary" />;
  }
}

export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272f"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-sm font-bold">{score}</span>
    </div>
  );
}

export function EmptyProject() {
  const addProject = useAppStore((s) => s.addProject);
  const isSelectingProject = useAppStore((s) => s.isSelectingProject);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12">
      <div className="rounded-2xl border border-border bg-card p-8 text-center glow-blue">
        <h2 className="text-lg font-semibold">No project selected</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Add an Expo project folder to scan configuration, visualize routes, and check release readiness.
        </p>
        <Button className="mt-4" onClick={() => addProject()} disabled={isSelectingProject}>
          <Plus className="mr-2 h-4 w-4" />
          {isSelectingProject ? "Opening…" : "Add project"}
        </Button>
      </div>
    </div>
  );
}
