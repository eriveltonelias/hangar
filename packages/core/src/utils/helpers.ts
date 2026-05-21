import type { Issue, IssueSeverity } from "../types/index.js";

let issueCounter = 0;

export function resetIssueCounter(): void {
  issueCounter = 0;
}

export function createIssue(
  partial: Omit<Issue, "id"> & { id?: string },
): Issue {
  issueCounter += 1;
  return {
    id: partial.id ?? `issue-${issueCounter}`,
    ...partial,
  };
}

export function createPassedCheck(
  category: string,
  title: string,
  description: string,
  filePath?: string,
): Issue {
  return createIssue({
    severity: "passed",
    category,
    title,
    description,
    filePath,
  });
}

export function severityWeight(severity: IssueSeverity): number {
  switch (severity) {
    case "critical":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
    case "passed":
      return 3;
    default:
      return 2;
  }
}

export function calculateHealthScore(issues: Issue[]): number {
  const actionable = issues.filter((i) => i.severity !== "passed");
  if (actionable.length === 0) return 100;

  let score = 100;
  for (const issue of actionable) {
    switch (issue.severity) {
      case "critical":
        score -= 15;
        break;
      case "warning":
        score -= 5;
        break;
      case "info":
        score -= 2;
        break;
    }
  }

  const passedCount = issues.filter((i) => i.severity === "passed").length;
  score += Math.min(passedCount * 0.5, 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function parseJsonSafe<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function getPackageVersion(
  dependencies: Record<string, string> | undefined,
  packageName: string,
): string | undefined {
  if (!dependencies) return undefined;
  const version = dependencies[packageName];
  if (!version) return undefined;
  return version.replace(/^[\^~>=<]+/, "");
}

export function joinPath(...parts: string[]): string {
  return parts
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export function detectStagingUrl(content: string): boolean {
  const patterns = [
    /localhost/i,
    /127\.0\.0\.1/,
    /staging\./i,
    /dev\./i,
    /sandbox\./i,
    /\.local/i,
    /ngrok/i,
  ];
  return patterns.some((p) => p.test(content));
}

export const DEPRECATED_PACKAGES = [
  "react-native-unimodules",
  "@unimodules/core",
  "expo-app-loading",
  "expo-analytics-amplitude",
  "@expo/webpack-config",
] as const;

export const RISKY_PACKAGES = [
  "react-native-vector-icons",
  "moment",
] as const;

export const EAS_BUILD_PROFILES = ["development", "preview", "production"] as const;
