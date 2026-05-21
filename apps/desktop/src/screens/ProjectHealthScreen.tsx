import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, TabsContent } from "@expopilot/ui";
import { useAppStore, getIssuesBySeverity, getActionableIssues } from "@/lib/store";
import { SeverityBadge, SeverityIcon, ScoreRing, EmptyProject } from "@/components/shared";
import { ExpoDoctorSection } from "@/components/ExpoDoctorSection";
import { SdkVersionSection } from "@/components/SdkVersionSection";
import { VerifyBeforeBuildSection } from "@/components/VerifyBeforeBuildSection";
import { Wrench, ExternalLink } from "lucide-react";
import { openInEditorWithFeedback } from "@/lib/file-actions";

export function ProjectHealthScreen() {
  const scanResult = useAppStore((s) => s.scanResult);
  const projectPath = useAppStore((s) => s.projectPath);
  const settings = useAppStore((s) => s.settings);
  const isScanning = useAppStore((s) => s.isScanning);
  const [tab, setTab] = useState("all");

  if (!projectPath) return <EmptyProject />;

  const issues = scanResult?.issues ?? [];
  const critical = getIssuesBySeverity(issues, "critical");
  const warnings = getIssuesBySeverity(issues, "warning");
  const passed = getIssuesBySeverity(issues, "passed");
  const actionable = getActionableIssues(issues);

  const filtered =
    tab === "all" ? issues.filter((i) => i.severity !== "passed") :
    tab === "critical" ? critical :
    tab === "warnings" ? warnings :
    passed;

  const recommendedFixes = actionable
    .filter((i) => i.suggestedFix)
    .slice(0, 5);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Project Health</h2>
          <p className="text-sm text-muted-foreground">
            {isScanning ? "Scanning…" : scanResult?.metadata.scannedAt
              ? `Last scan: ${new Date(scanResult.metadata.scannedAt).toLocaleString()}`
              : "Run a scan to analyze your project"}
          </p>
        </div>
        <ScoreRing score={scanResult?.healthScore ?? 0} size={72} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Critical", count: critical.length, color: "text-destructive" },
          { label: "Warnings", count: warnings.length, color: "text-warning" },
          { label: "Passed", count: passed.length, color: "text-success" },
          { label: "Total Checks", count: issues.length, color: "text-foreground" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <SdkVersionSection />

      <VerifyBeforeBuildSection />

      <ExpoDoctorSection />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">All ({actionable.length})</TabsTrigger>
              <TabsTrigger value="critical">Critical ({critical.length})</TabsTrigger>
              <TabsTrigger value="warnings">Warnings ({warnings.length})</TabsTrigger>
              <TabsTrigger value="passed">Passed ({passed.length})</TabsTrigger>
            </TabsList>

            <TabsContent value={tab}>
              <div className="space-y-2">
                {filtered.map((issue) => (
                  <Card key={issue.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <SeverityIcon severity={issue.severity} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{issue.title}</p>
                            <SeverityBadge severity={issue.severity} />
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {issue.category}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
                          {issue.filePath && (
                            <button
                              type="button"
                              onClick={() => void openInEditorWithFeedback(issue.filePath!, settings.preferredEditor)}
                              className="mt-2 flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                            >
                              {issue.filePath}
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
                          {issue.suggestedFix && (
                            <p className="mt-2 text-xs text-success">
                              <Wrench className="mr-1 inline h-3 w-3" />
                              {issue.suggestedFix}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filtered.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No issues in this category.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Recommended Fixes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendedFixes.map((issue) => (
              <div key={issue.id} className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium">{issue.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{issue.suggestedFix}</p>
              </div>
            ))}
            {recommendedFixes.length === 0 && (
              <p className="text-xs text-muted-foreground">No recommended fixes - project looks healthy.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
