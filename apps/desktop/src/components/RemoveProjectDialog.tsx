import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@expopilot/ui";
import { useAppStore } from "@/lib/store";

export function RemoveProjectDialog() {
  const pending = useAppStore((s) => s.projectPendingRemoval);
  const cancelRemoveProject = useAppStore((s) => s.cancelRemoveProject);
  const confirmRemoveProject = useAppStore((s) => s.confirmRemoveProject);
  const isRemovingProject = useAppStore((s) => s.isRemovingProject);

  useEffect(() => {
    if (!pending) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !useAppStore.getState().isRemovingProject) {
        useAppStore.getState().cancelRemoveProject();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [pending]);

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => !isRemovingProject && cancelRemoveProject()}
    >
      <Card
        className="w-full max-w-md border-warning/30 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Remove &ldquo;{pending.name}&rdquo;?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This removes the project from ExpoPilot only. Your source code and files on disk are{" "}
            <span className="font-medium text-foreground">not deleted</span> - you can add the folder
            back anytime.
          </p>
          <p className="truncate rounded-lg border border-border bg-secondary/30 px-3 py-2 font-mono text-xs text-muted-foreground">
            {pending.path}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={cancelRemoveProject} disabled={isRemovingProject}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirmRemoveProject()} disabled={isRemovingProject}>
              {isRemovingProject ? "Removing…" : "Remove from ExpoPilot"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
