import {
  FolderOpen,
  HeartPulse,
  Hammer,
  GitBranch,
  Shield,
  Plus,
  Zap,
} from "lucide-react";
import { Button } from "@hangar/ui";
import { useAppStore } from "@/lib/store";

const FEATURES = [
  {
    icon: HeartPulse,
    title: "Project health",
    description: "Scan config, dependencies, and release blockers locally.",
  },
  {
    icon: Hammer,
    title: "EAS builds",
    description: "Review build history and parse failed logs.",
  },
  {
    icon: GitBranch,
    title: "Router map",
    description: "Visualize Expo Router routes and screen structure.",
  },
  {
    icon: Shield,
    title: "Local-first",
    description: "Your source code never leaves your machine.",
  },
] as const;

export function WelcomeScreen() {
  const addProject = useAppStore((s) => s.addProject);
  const isSelectingProject = useAppStore((s) => s.isSelectingProject);
  const scanError = useAppStore((s) => s.scanError);
  const setScanError = useAppStore((s) => s.setScanError);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(59,130,246,0.12),transparent)]"
      />

      <div className="relative w-full max-w-[680px]">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-[0_0_24px_rgba(59,130,246,0.15)]">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome to Hangar
          </h1>
          <p className="mx-auto mt-2 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
            Add an Expo project folder to start scanning configuration, tracking EAS builds, and
            preparing releases.
          </p>
        </header>

        <section className="rounded-2xl border border-border/80 bg-card/50 px-6 py-8 sm:px-10">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary/50">
              <FolderOpen className="h-5 w-5 text-primary" strokeWidth={1.75} />
            </div>

            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Add your first project
            </h2>
            <p className="mt-1.5 max-w-[340px] text-sm leading-relaxed text-muted-foreground">
              Choose a local folder that contains a{" "}
              <span className="font-mono text-[0.8125rem] text-foreground/80">package.json</span>{" "}
              and Expo app files.
            </p>

            <Button
              size="lg"
              className="mt-5 h-10 min-w-[200px] px-6 text-sm font-medium"
              onClick={() => addProject()}
              disabled={isSelectingProject}
            >
              <Plus className="h-4 w-4" />
              {isSelectingProject ? "Opening folder picker…" : "Add project folder"}
            </Button>

            {scanError && (
              <div className="mt-4 w-full max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-left text-sm text-destructive">
                <div className="flex items-start justify-between gap-3">
                  <span className="line-clamp-2">{scanError}</span>
                  <button
                    type="button"
                    onClick={() => setScanError(null)}
                    className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-xl border border-border/70 bg-card/30 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">{title}</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
