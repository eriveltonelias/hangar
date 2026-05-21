import type {
  FileSystemAdapter,
  ScanResult,
  Check,
  Issue,
} from "../types/index.js";
import {
  calculateHealthScore,
  resetIssueCounter,
  getPackageVersion,
  joinPath,
  basename,
} from "../utils/helpers.js";
import {
  ALL_SCAN_RULES,
  loadScanContext,
} from "../rules/index.js";

export async function scanProject(
  projectPath: string,
  fs: FileSystemAdapter,
): Promise<ScanResult> {
  resetIssueCounter();

  const ctx = await loadScanContext(projectPath, fs);
  const allIssues: Issue[] = [];

  for (const rule of ALL_SCAN_RULES) {
    const issues = await rule(ctx);
    allIssues.push(...issues);
  }

  const checks: Check[] = allIssues.map((issue) => ({
    id: issue.id,
    name: issue.title,
    passed: issue.severity === "passed",
    severity: issue.severity,
  }));

  const deps = ctx.packageJson
    ? { ...ctx.packageJson.dependencies, ...ctx.packageJson.devDependencies }
    : {};
  const sdkVersion = getPackageVersion(deps, "expo");
  const hasExpo = !!sdkVersion;
  const hasRouter = !!deps["expo-router"];

  const healthScore = calculateHealthScore(allIssues);
  const packageManager = await detectPackageManager(projectPath, fs);

  return {
    projectName: ctx.packageJson?.name ?? basename(projectPath),
    projectPath,
    detectedFramework: hasExpo ? "expo" : "unknown",
    sdkVersion,
    healthScore,
    issues: allIssues,
    checks,
    metadata: {
      scannedAt: new Date().toISOString(),
      packageManager,
      hasEasJson: !!ctx.easJson,
      hasAppConfig: !!ctx.appConfig,
      expoRouterEnabled: hasRouter,
      easBuildConfigured: !!ctx.easJson?.build,
    },
  };
}

async function detectPackageManager(
  projectPath: string,
  fs: FileSystemAdapter,
): Promise<ScanResult["metadata"]["packageManager"]> {
  if (await fs.exists(joinPath(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (await fs.exists(joinPath(projectPath, "yarn.lock"))) return "yarn";
  if (await fs.exists(joinPath(projectPath, "bun.lockb"))) return "bun";
  if (await fs.exists(joinPath(projectPath, "package-lock.json"))) return "npm";
  return "unknown";
}

export function formatScanReportMarkdown(result: ScanResult): string {
  const lines: string[] = [
    `# Hangar Health Report: ${result.projectName}`,
    "",
    `**Health Score:** ${result.healthScore}/100`,
    `**Scanned:** ${result.metadata.scannedAt}`,
    `**SDK:** ${result.sdkVersion ?? "Unknown"}`,
    "",
    "## Issues",
    "",
  ];

  const grouped = {
    critical: result.issues.filter((i) => i.severity === "critical"),
    warning: result.issues.filter((i) => i.severity === "warning"),
    info: result.issues.filter((i) => i.severity === "info"),
    passed: result.issues.filter((i) => i.severity === "passed"),
  };

  for (const [severity, issues] of Object.entries(grouped)) {
    if (issues.length === 0) continue;
    lines.push(`### ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${issues.length})`);
    lines.push("");
    for (const issue of issues) {
      lines.push(`- **${issue.title}** (${issue.category})`);
      lines.push(`  ${issue.description}`);
      if (issue.suggestedFix) lines.push(`  _Fix:_ ${issue.suggestedFix}`);
      if (issue.filePath) lines.push(`  _File:_ \`${issue.filePath}\``);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function doctorSummary(result: ScanResult): string {
  const critical = result.issues.filter((i) => i.severity === "critical").length;
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  const passed = result.issues.filter((i) => i.severity === "passed").length;

  if (critical > 0) {
    return `${critical} critical issue(s) found. Fix these before shipping.`;
  }
  if (warnings > 0) {
    return `${warnings} warning(s) found. Review recommended fixes.`;
  }
  return `All ${passed} checks passed. Project looks healthy.`;
}
