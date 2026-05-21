import { Card, CardContent, CardHeader, CardTitle, Badge } from "@expopilot/ui";
import { useAppStore } from "@/lib/store";
import { EmptyProject } from "@/components/shared";
import { AlertTriangle } from "lucide-react";

export function EnvironmentsScreen() {
  const projectPath = useAppStore((s) => s.projectPath);
  const easData = useAppStore((s) => s.easData);
  const isLoadingEas = useAppStore((s) => s.isLoadingEas);

  if (!projectPath) return <EmptyProject />;

  const environments = easData?.environments ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Environments</h2>
        <p className="text-sm text-muted-foreground">
          Build profile to channel, branch, and env file mapping from eas.json + EAS
        </p>
      </div>

      {environments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {isLoadingEas
              ? "Loading environment mappings..."
              : "No eas.json build profiles found. Add eas.json to configure EAS build profiles."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {environments.map((env) => (
            <Card key={env.profile}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="capitalize">{env.profile}</CardTitle>
                  {env.warnings.length > 0 ? (
                    <Badge variant="warning">Warnings</Badge>
                  ) : (
                    <Badge variant="success">OK</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Build Profile", env.profile],
                    ["EAS Channel", env.channel],
                    ["Branch", env.branch],
                    ["Env File", env.envFile ?? "—"],
                    ["API URL", env.apiUrl ?? "—"],
                    ["Runtime Version", env.runtimeVersion ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="mt-0.5 truncate font-mono text-xs">{value}</p>
                    </div>
                  ))}
                </div>
                {env.warnings.map((w) => (
                  <div key={w.id} className="mt-3 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{w.title}</p>
                      <p className="text-[11px] text-muted-foreground">{w.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Environment Warnings</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            ExpoPilot reads local <code className="font-mono text-xs text-foreground">.env*</code> files and flags
            production profiles that reference localhost, staging, or dev URLs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
