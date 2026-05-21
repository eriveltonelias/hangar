import type {
  BuildVerificationCheck,
  BuildVerificationResult,
  ExpoConfigResult,
  ExpoDoctorResult,
  ScanResult,
} from "../types/index.js";

interface EvaluateBuildVerificationInput {
  scanResult: ScanResult | null;
  expoDoctor: ExpoDoctorResult | null;
  expoConfig: ExpoConfigResult | null;
  gitClean: boolean;
  gitAvailable?: boolean;
}

function countBySeverity(scanResult: ScanResult | null, severity: "critical" | "warning") {
  return scanResult?.issues.filter((issue) => issue.severity === severity).length ?? 0;
}

export function evaluateBuildVerification(
  input: EvaluateBuildVerificationInput,
): BuildVerificationResult {
  const checks: BuildVerificationCheck[] = [];
  const criticalCount = countBySeverity(input.scanResult, "critical");
  const warningCount = countBySeverity(input.scanResult, "warning");

  checks.push({
    id: "project-scan",
    label: "Project configuration scan",
    status: criticalCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass",
    description:
      criticalCount > 0
        ? `${criticalCount} critical issue(s) found in local project files.`
        : warningCount > 0
          ? `${warningCount} warning(s) found - review on Project Health.`
          : "Local config, assets, and EAS files look good.",
  });

  if (input.expoConfig) {
    if (input.expoConfig.status === "success") {
      checks.push({
        id: "expo-config",
        label: "Expo config loads",
        status: "pass",
        description: input.expoConfig.slug
          ? `Resolved app config (slug: ${input.expoConfig.slug}).`
          : "npx expo config completed without errors.",
      });
    } else {
      checks.push({
        id: "expo-config",
        label: "Expo config loads",
        status: "fail",
        description:
          input.expoConfig.error ??
          "App config failed to load. Fix app.config.ts/js or config plugins.",
      });
    }
  } else {
    checks.push({
      id: "expo-config",
      label: "Expo config loads",
      status: "warn",
      description: "Run Verify before build to validate app.config.ts/js and plugins.",
    });
  }

  if (input.expoDoctor) {
    if (input.expoDoctor.status === "success") {
      checks.push({
        id: "expo-doctor",
        label: "Expo Doctor",
        status: "pass",
        description: `${input.expoDoctor.passed}/${input.expoDoctor.total} checks passed.`,
      });
    } else if (input.expoDoctor.status === "failed") {
      checks.push({
        id: "expo-doctor",
        label: "Expo Doctor",
        status: "warn",
        description: `${input.expoDoctor.total - input.expoDoctor.passed} check(s) failed. Review on Project Health.`,
      });
    } else {
      checks.push({
        id: "expo-doctor",
        label: "Expo Doctor",
        status: "warn",
        description: input.expoDoctor.error ?? "Expo Doctor could not run.",
      });
    }
  } else {
    checks.push({
      id: "expo-doctor",
      label: "Expo Doctor",
      status: "warn",
      description: "Run Verify before build to execute expo-doctor.",
    });
  }

  const easConfigured = input.scanResult?.metadata.easBuildConfigured ?? false;
  checks.push({
    id: "eas-build",
    label: "EAS build profiles",
    status: easConfigured ? "pass" : "fail",
    description: easConfigured
      ? "eas.json build profiles are configured."
      : "Add EAS build profiles with eas build:configure.",
  });

  if (input.gitAvailable === false) {
    checks.push({
      id: "git-clean",
      label: "Git working tree",
      status: "warn",
      description: "This project is not a git repository.",
    });
  } else {
    checks.push({
      id: "git-clean",
      label: "Git working tree",
      status: input.gitClean ? "pass" : "warn",
      description: input.gitClean
        ? "No uncommitted changes detected."
        : "Uncommitted changes - EAS builds use your latest commit snapshot.",
    });
  }

  const googleServicesIssue = input.scanResult?.issues.find((issue) =>
    issue.id.startsWith("google-services"),
  );
  if (googleServicesIssue) {
    checks.push({
      id: "google-services",
      label: "google-services.json",
      status: googleServicesIssue.severity === "critical" ? "fail" : "warn",
      description: googleServicesIssue.suggestedFix ?? googleServicesIssue.description,
    });
  }

  const canBuild = checks.every((check) => check.status !== "fail");
  const hasWarnings = checks.some((check) => check.status === "warn");

  return {
    ranAt: new Date().toISOString(),
    checks,
    canBuild,
    hasWarnings,
  };
}
