import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderOpen, Plus, Trash2 } from "lucide-react";
import { cn } from "@expopilot/ui";
import { useAppStore } from "@/lib/store";

export function ProjectSwitcher() {
  const projects = useAppStore((s) => s.projects);
  const projectPath = useAppStore((s) => s.projectPath);
  const projectName = useAppStore((s) => s.projectName);
  const addProject = useAppStore((s) => s.addProject);
  const switchProject = useAppStore((s) => s.switchProject);
  const requestRemoveProject = useAppStore((s) => s.requestRemoveProject);
  const isScanning = useAppStore((s) => s.isScanning);
  const isSelectingProject = useAppStore((s) => s.isSelectingProject);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const busy = isScanning || isSelectingProject;

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleSwitch = async (path: string) => {
    setOpen(false);
    if (path !== projectPath) {
      await switchProject(path);
    }
  };

  const handleAdd = async () => {
    setOpen(false);
    await addProject();
  };

  const handleRemove = (event: React.MouseEvent, path: string) => {
    event.preventDefault();
    event.stopPropagation();
    requestRemoveProject(path);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        className="flex max-w-[280px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{projectName ?? "Select project"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[360px] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Projects</p>
          </div>

          <div className="max-h-[280px] overflow-y-auto p-1">
            {projects.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No projects yet. Add an Expo project folder to get started.
              </p>
            ) : (
              projects.map((project) => {
                const active = project.path === projectPath;
                return (
                  <div
                    key={project.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => !busy && handleSwitch(project.path)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (!busy) handleSwitch(project.path);
                      }
                    }}
                    className={cn(
                      "group flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent",
                      active && "bg-accent/70",
                      busy && "pointer-events-none opacity-50",
                    )}
                  >
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {active ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <span className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{project.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{project.path}</p>
                    </div>
                    <button
                      type="button"
                      title="Remove from ExpoPilot"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => handleRemove(event, project.path)}
                      disabled={busy}
                      className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add project…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
