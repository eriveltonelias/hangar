import { Card, CardContent, CardHeader, CardTitle, Label, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Button } from "@hangar/ui";
import { useAppStore } from "@/lib/store";
import { checkEasCliInstalled } from "@/lib/services";
import { EasLoginRequired } from "@/components/EasLoginRequired";
import { isTauri } from "@/lib/platform";
import { Shield, Plus, Trash2, Check, Compass } from "lucide-react";
import { useState } from "react";
import { cn } from "@hangar/ui";

export function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const projects = useAppStore((s) => s.projects);
  const projectPath = useAppStore((s) => s.projectPath);
  const addProject = useAppStore((s) => s.addProject);
  const switchProject = useAppStore((s) => s.switchProject);
  const requestRemoveProject = useAppStore((s) => s.requestRemoveProject);
  const loadEasData = useAppStore((s) => s.loadEasData);
  const isLoadingEas = useAppStore((s) => s.isLoadingEas);
  const easError = useAppStore((s) => s.easError);
  const easAuth = useAppStore((s) => s.easAuth);
  const isCheckingEasAuth = useAppStore((s) => s.isCheckingEasAuth);
  const checkEasAuth = useAppStore((s) => s.checkEasAuth);
  const scanProject = useAppStore((s) => s.scanProject);
  const isScanning = useAppStore((s) => s.isScanning);
  const replayTour = useAppStore((s) => s.replayTour);
  const [easInstalled, setEasInstalled] = useState<boolean | null>(null);

  const needsEasLogin = isTauri() && easAuth !== null && easAuth.state !== "logged-in" && easAuth.state !== "unavailable";

  const update = (partial: Partial<typeof settings>) => {
    setSettings({ ...settings, ...partial });
  };

  const handleCheckEas = async () => {
    const installed = await checkEasCliInstalled(settings.easCliPath);
    setEasInstalled(installed);
  };

  const handleAddProject = async () => {
    await addProject();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Configure Hangar preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects saved yet. Add an Expo project folder to start scanning.
            </p>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => {
                const active = project.path === projectPath;
                return (
                  <div
                    key={project.path}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border border-border px-3 py-3",
                      active && "border-primary/30 bg-primary/5",
                    )}
                  >
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{project.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{project.path}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {!active && (
                        <Button variant="secondary" size="sm" onClick={() => switchProject(project.path)}>
                          Open
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => requestRemoveProject(project.path)}
                        title="Remove from Hangar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button variant="secondary" onClick={handleAddProject}>
            <Plus className="mr-2 h-4 w-4" />
            Add project
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EAS Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isTauri() && (
            <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">EAS account: </span>
              {isCheckingEasAuth ? (
                <span>Checking…</span>
              ) : easAuth?.state === "logged-in" ? (
                <span className="text-success">Logged in as {easAuth.username}</span>
              ) : easAuth?.state === "cli-not-found" ? (
                <span className="text-destructive">EAS CLI not found</span>
              ) : easAuth?.state === "not-logged-in" ? (
                <span className="text-warning">Not logged in</span>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </div>
          )}

          {needsEasLogin && <EasLoginRequired />}

          <div className="space-y-2">
            <Label>EAS CLI path (optional)</Label>
            <Input
              value={settings.easCliPath ?? ""}
              onChange={(e) => update({ easCliPath: e.target.value || undefined })}
              placeholder="/usr/local/bin/eas"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={handleCheckEas}>
              Check EAS CLI
            </Button>
            {isTauri() && (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const status = await checkEasAuth();
                  if (status.state === "logged-in") {
                    await loadEasData();
                  }
                }}
                disabled={isCheckingEasAuth}
              >
                Check Login
              </Button>
            )}
            {projectPath && (
              <Button variant="secondary" size="sm" onClick={() => loadEasData()} disabled={isLoadingEas}>
                Refresh EAS Data
              </Button>
            )}
            {easInstalled !== null && (
              <span className={`text-xs ${easInstalled ? "text-success" : "text-destructive"}`}>
                {easInstalled ? "EAS CLI found" : "EAS CLI not found"}
              </span>
            )}
          </div>
          {easError && (
            <p className="text-xs text-destructive">{easError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Preferred editor</Label>
            <Select
              value={settings.preferredEditor}
              onValueChange={(v) => update({ preferredEditor: v as typeof settings.preferredEditor })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cursor">Cursor</SelectItem>
                <SelectItem value="vscode">VS Code</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Project scanning</Label>
            <p className="text-sm text-muted-foreground">
              Projects are scanned when added and kept up to date automatically when local files change.
              Cached results load instantly on app open and when switching projects.
            </p>
            <div className="flex flex-wrap gap-2">
              {projectPath && (
                <Button variant="secondary" size="sm" onClick={() => scanProject()} disabled={isScanning}>
                  Rescan project now
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => replayTour()}>
                <Compass className="mr-2 h-3.5 w-3.5" />
                Replay onboarding tour
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Theme</Label>
            <Select
              value={settings.theme}
              onValueChange={(v) => update({ theme: v as typeof settings.theme })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-success" />
            Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Hangar scans your project locally. Source code is never uploaded to external services.
          </p>
          <p>
            EAS tokens are not stored in plain text. Command execution is scoped to your selected project folder.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
