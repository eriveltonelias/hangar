import { AlertTriangle, ArrowRight, CheckCircle2, Info, XCircle } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { computeNextAction, type NextActionTone } from "@/lib/next-action";
import { isTauri } from "@/lib/platform";

const TONE: Record<NextActionTone, { icon: typeof Info; ring: string; iconBg: string; iconColor: string }> = {
  critical: {
    icon: XCircle,
    ring: "border-destructive/30 bg-destructive/[0.06]",
    iconBg: "bg-destructive/15",
    iconColor: "text-destructive",
  },
  warning: {
    icon: AlertTriangle,
    ring: "border-warning/30 bg-warning/[0.06]",
    iconBg: "bg-warning/15",
    iconColor: "text-warning",
  },
  ready: {
    icon: CheckCircle2,
    ring: "border-success/30 bg-success/[0.06]",
    iconBg: "bg-success/15",
    iconColor: "text-success",
  },
  info: {
    icon: Info,
    ring: "border-border bg-card",
    iconBg: "bg-primary/15",
    iconColor: "text-primary",
  },
};

export function NextActionHero() {
  const scanResult = useAppStore((s) => s.scanResult);
  const routerResult = useAppStore((s) => s.routerResult);
  const easData = useAppStore((s) => s.easData);
  const easAuth = useAppStore((s) => s.easAuth);
  const environment = useAppStore((s) => s.environment);
  const credentials = useAppStore((s) => s.credentials);
  const bundleHistory = useAppStore((s) => s.bundleHistory);
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);

  const action = computeNextAction({
    isTauri: isTauri(),
    scanResult,
    routerResult,
    easData,
    easAuth,
    environment,
    credentials,
    bundleHistory,
  });

  if (!action) return null;
  const style = TONE[action.tone];
  const Icon = style.icon;

  return (
    <button
      type="button"
      data-tour="next-action"
      onClick={() => setActiveScreen(action.cta.screen)}
      className={`group flex w-full items-center gap-4 rounded-xl border p-5 text-left transition-colors hover:bg-accent/30 ${style.ring}`}
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${style.iconBg}`}>
        <Icon className={`h-6 w-6 ${style.iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Next step
        </p>
        <p className="mt-0.5 text-base font-semibold leading-tight">{action.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-foreground/5 px-3 py-2 text-xs font-medium text-foreground transition-colors group-hover:bg-foreground/10">
        {action.cta.label}
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}
