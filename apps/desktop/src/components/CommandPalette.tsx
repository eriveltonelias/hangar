import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import {
  Hammer,
  HeartPulse,
  LayoutDashboard,
  RefreshCw,
  Rocket,
  Settings,
  GitBranch,
  Globe,
  Search,
  Stethoscope,
  Store,
  FolderOpen,
  ChevronRight,
  Package,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { isTauri } from "@/lib/platform";
import { toast } from "@/lib/notify";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: "Navigate" | "Project" | "Ship" | "Diagnose";
  icon: ComponentType<{ className?: string }>;
  keywords?: string;
  /** Returns true if the command is currently runnable. */
  enabled?: () => boolean;
  run: () => void | Promise<void>;
}

function useCommands(close: () => void): Command[] {
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);
  const addProject = useAppStore((s) => s.addProject);
  const scanProject = useAppStore((s) => s.scanProject);
  const verifyBeforeBuild = useAppStore((s) => s.verifyBeforeBuild);
  const runExpoDoctorCheck = useAppStore((s) => s.runExpoDoctorCheck);
  const scanCredentials = useAppStore((s) => s.scanCredentials);
  const scanBundle = useAppStore((s) => s.scanBundle);
  const runExpoExport = useAppStore((s) => s.runExpoExport);
  const refreshBuilds = useAppStore((s) => s.refreshBuilds);
  const loadEasData = useAppStore((s) => s.loadEasData);
  const projects = useAppStore((s) => s.projects);
  const projectPath = useAppStore((s) => s.projectPath);
  const switchProject = useAppStore((s) => s.switchProject);

  return useMemo<Command[]>(() => {
    const nav = (id: string, label: string, icon: ComponentType<{ className?: string }>): Command => ({
      id: `nav:${id}`,
      label,
      group: "Navigate",
      icon,
      keywords: `go to open show ${label.toLowerCase()}`,
      run: () => {
        setActiveScreen(id);
        close();
      },
    });

    const cmds: Command[] = [
      nav("dashboard", "Dashboard", LayoutDashboard),
      nav("health", "Project Health", HeartPulse),
      nav("builds", "Builds", Hammer),
      nav("updates", "Updates", RefreshCw),
      nav("router", "Router", GitBranch),
      nav("releases", "Releases", Rocket),
      nav("environments", "Environments", Globe),
      nav("credentials", "Credentials", HeartPulse),
      nav("bundle", "Bundle size", Package),
      nav("settings", "Settings", Settings),

      {
        id: "project:add",
        label: "Open project…",
        hint: "Pick an Expo project folder",
        group: "Project",
        icon: FolderOpen,
        keywords: "add open import folder",
        run: () => {
          close();
          void addProject();
        },
      },

      ...projects
        .filter((p) => p.path !== projectPath)
        .map<Command>((p) => ({
          id: `project:switch:${p.path}`,
          label: `Switch to ${p.name}`,
          hint: p.path,
          group: "Project",
          icon: ChevronRight,
          keywords: `switch project ${p.name.toLowerCase()}`,
          run: () => {
            close();
            void switchProject(p.path);
          },
        })),

      {
        id: "diag:scan",
        label: "Rescan project",
        group: "Diagnose",
        icon: RefreshCw,
        keywords: "scan health refresh",
        enabled: () => Boolean(projectPath),
        run: () => {
          close();
          void scanProject().then(() =>
            toast.success({ title: "Project scan finished" }),
          );
        },
      },
      {
        id: "diag:verify",
        label: "Verify ship readiness",
        hint: "Run all pre-build checks",
        group: "Diagnose",
        icon: HeartPulse,
        keywords: "verify build ready check",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          setActiveScreen("health");
          void verifyBeforeBuild();
        },
      },
      {
        id: "diag:doctor",
        label: "Run expo-doctor",
        group: "Diagnose",
        icon: Stethoscope,
        keywords: "doctor diagnose",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          void runExpoDoctorCheck();
        },
      },
      {
        id: "diag:credentials",
        label: "Rescan credentials",
        hint: "Find expiring certs and provisioning profiles",
        group: "Diagnose",
        icon: Stethoscope,
        keywords: "credentials certs provisioning expiry",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          void scanCredentials();
        },
      },
      {
        id: "diag:bundle",
        label: "Measure bundle size",
        hint: "Read dist/ and snapshot the size",
        group: "Diagnose",
        icon: Package,
        keywords: "bundle size dist export weight",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          void scanBundle();
        },
      },
      {
        id: "ship:expo-export",
        label: "Run expo export",
        hint: "Generate a fresh dist/ and measure",
        group: "Ship",
        icon: Package,
        keywords: "expo export bundle build dist",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          void runExpoExport();
        },
      },

      {
        id: "ship:refresh-eas",
        label: "Refresh EAS data",
        group: "Ship",
        icon: RefreshCw,
        keywords: "reload eas builds updates",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          void loadEasData();
        },
      },
      {
        id: "ship:refresh-builds",
        label: "Refresh builds",
        group: "Ship",
        icon: Hammer,
        keywords: "reload builds",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          void refreshBuilds();
        },
      },
      {
        id: "ship:deploy",
        label: "Deploy to store…",
        group: "Ship",
        icon: Store,
        keywords: "submit app store play",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          // Defer to DeployDialog via store flag (simpler: just navigate; the
          // dialog lives in TopBar and is opened from there).
          setActiveScreen("releases");
          toast.info({
            title: "Open Deploy from the top bar",
            description: "Click the Deploy button to submit to the App Store or Google Play.",
          });
        },
      },
      {
        id: "ship:publish",
        label: "Publish update…",
        group: "Ship",
        icon: Rocket,
        keywords: "ota publish update eas",
        enabled: () => Boolean(projectPath) && isTauri(),
        run: () => {
          close();
          setActiveScreen("updates");
          toast.info({
            title: "Open Publish from the top bar",
            description: "Click Publish in the top bar to send an EAS update.",
          });
        },
      },
    ];

    return cmds.filter((c) => (c.enabled ? c.enabled() : true));
  }, [
    projects,
    projectPath,
    setActiveScreen,
    addProject,
    switchProject,
    scanProject,
    verifyBeforeBuild,
    runExpoDoctorCheck,
    scanCredentials,
    scanBundle,
    runExpoExport,
    loadEasData,
    refreshBuilds,
    close,
  ]);
}

function score(command: Command, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const hay = `${command.label} ${command.hint ?? ""} ${command.keywords ?? ""}`.toLowerCase();
  if (hay.includes(q)) return 2;
  // Letter-by-letter subsequence match
  let i = 0;
  for (const ch of hay) {
    if (ch === q[i]) i++;
    if (i === q.length) return 1;
  }
  return 0;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = () => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  };

  const commands = useCommands(close);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    return commands
      .map((c) => ({ c, s: score(c, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [commands, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const groups = useMemo(() => {
    const order: Command["group"][] = ["Navigate", "Project", "Diagnose", "Ship"];
    const byGroup = new Map<Command["group"], Command[]>();
    for (const c of filtered) {
      const arr = byGroup.get(c.group) ?? [];
      arr.push(c);
      byGroup.set(c.group, arr);
    }
    return order.flatMap((g) => {
      const items = byGroup.get(g);
      return items ? [{ group: g, items }] : [];
    });
  }, [filtered]);

  const flatList = filtered;

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = flatList[highlight];
      if (cmd) void cmd.run();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-background/60 px-4 pt-[14vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-[640px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {flatList.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No matches for &ldquo;{query}&rdquo;
            </p>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} className="mb-1">
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                {items.map((cmd) => {
                  const idx = flatList.indexOf(cmd);
                  const active = idx === highlight;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => void cmd.run()}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate text-foreground">{cmd.label}</span>
                      {cmd.hint && (
                        <span className="truncate text-[11px] text-muted-foreground">{cmd.hint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <span>↑↓ navigate · ↵ run</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
