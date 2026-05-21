import { useState } from "react";
import {
  LayoutDashboard,
  HeartPulse,
  Hammer,
  RefreshCw,
  GitBranch,
  Rocket,
  Store,
  Globe,
  Settings,
  ShieldCheck,
  Package,
  Zap,
} from "lucide-react";
import { cn } from "@hangar/ui";
import { useAppStore } from "@/lib/store";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { PublishUpdateDialog } from "@/components/PublishUpdateDialog";
import { DeployDialog } from "@/components/DeployDialog";
import { isTauri } from "@/lib/platform";

const PINNED_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

interface NavGroup {
  label: string;
  items: ReadonlyArray<{ id: string; label: string; icon: typeof LayoutDashboard }>;
}

const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    label: "Ship",
    items: [
      { id: "builds", label: "Builds", icon: Hammer },
      { id: "updates", label: "Updates", icon: RefreshCw },
      { id: "releases", label: "Releases", icon: Rocket },
    ],
  },
  {
    label: "Health",
    items: [
      { id: "health", label: "Project Health", icon: HeartPulse },
      { id: "router", label: "Router", icon: GitBranch },
      { id: "bundle", label: "Bundle size", icon: Package },
    ],
  },
  {
    label: "Project",
    items: [
      { id: "environments", label: "Environments", icon: Globe },
      { id: "credentials", label: "Credentials", icon: ShieldCheck },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

function NavButton({
  id,
  label,
  icon: Icon,
  active,
  onSelect,
  credentialsDot,
}: {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  onSelect: (id: string) => void;
  credentialsDot: string | null;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {id === "credentials" && credentialsDot && (
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", credentialsDot)}
          aria-label="Attention needed"
        />
      )}
    </button>
  );
}

export function Sidebar() {
  const activeScreen = useAppStore((s) => s.activeScreen);
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);
  const credentialsStatus = useAppStore((s) => s.credentials?.worstStatus);
  const credentialsDot =
    credentialsStatus === "expired" || credentialsStatus === "critical"
      ? "bg-destructive"
      : credentialsStatus === "warning"
        ? "bg-warning"
        : null;

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight">Hangar</h1>
          <p className="text-[10px] text-muted-foreground">Ship with confidence.</p>
        </div>
      </div>

      <nav data-tour='sidebar-nav' className="flex-1 space-y-3 overflow-y-auto px-2 pb-2">
        <div className="space-y-0.5">
          {PINNED_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              {...item}
              active={activeScreen === item.id}
              onSelect={setActiveScreen}
              credentialsDot={credentialsDot}
            />
          ))}
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavButton
                key={item.id}
                {...item}
                active={activeScreen === item.id}
                onSelect={setActiveScreen}
                credentialsDot={credentialsDot}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <div
          data-tour="cmdk-hint"
          className="flex items-center justify-between rounded-md text-[10px] text-muted-foreground"
        >
          <span>Quick actions</span>
          <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          All scanning is local-first. No source code leaves your machine.
        </p>
      </div>
    </aside>
  );
}

export function TopBar() {
  const projectPath = useAppStore((s) => s.projectPath);
  const environment = useAppStore((s) => s.environment);
  const setEnvironment = useAppStore((s) => s.setEnvironment);
  const easAuth = useAppStore((s) => s.easAuth);
  const isDeploying = useAppStore((s) => s.isDeploying);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);

  const canRunEasActions = Boolean(projectPath) && isTauri();
  const deployBlocked = !canRunEasActions || isDeploying;

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectSwitcher />

          {projectPath && (
            <span className="hidden max-w-[300px] truncate text-xs text-muted-foreground lg:block">
              {projectPath}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-0.5" data-tour='environment-toggle'>
            {["development", "preview", "production"].map((env) => (
              <button
                key={env}
                type="button"
                onClick={() => setEnvironment(env)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  environment === env
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {env}
              </button>
            ))}
          </div>

          <div data-tour='ship-actions'>
          {isDeploying && (
            <button
              type="button"
              onClick={() => setDeployOpen(true)}
              title="A deploy is currently in progress — click to re-open the dialog"
              className="mr-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Deploying…
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeployOpen(true)}
            disabled={deployBlocked}
            title={
              isDeploying
                ? "A deploy is already running — wait for it to finish before starting another"
                : !isTauri()
                  ? "Deploying requires the desktop app"
                  : !projectPath
                    ? "Select a project first"
                    : easAuth?.state === "not-logged-in"
                      ? "Log in to EAS first"
                      : easAuth?.state === "cli-not-found"
                        ? "Install EAS CLI first"
                        : "Build and submit to App Store or Google Play"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            <Store className="h-3.5 w-3.5" />
            Deploy
          </button>

          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            disabled={!canRunEasActions}
            title={
              !isTauri()
                ? "Publishing requires the desktop app"
                : !projectPath
                  ? "Select a project first"
                  : easAuth?.state === "not-logged-in"
                    ? "Log in to EAS first"
                    : easAuth?.state === "cli-not-found"
                      ? "Install EAS CLI first"
                      : "Publish an EAS update"
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Rocket className="h-3.5 w-3.5" />
            Publish
          </button>
        </div>
        </div>
      </header>

      <DeployDialog open={deployOpen} onOpenChange={setDeployOpen} />
      <PublishUpdateDialog open={publishOpen} onOpenChange={setPublishOpen} />
    </>
  );
}
