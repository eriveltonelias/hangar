import type {
  ScanResult,
  RouterScanResult,
  BuildRecord,
  UpdateCompatibility,
  CredentialsReport,
  BundleSizeSnapshot,
} from "@expopilot/core";
import { computeBundleDelta, formatBytes, getExpoSdkStatus } from "@expopilot/core";
import type { EasData } from "./eas-service";
import type { EasAuthStatus } from "./eas-auth";

export type NextActionTone = "critical" | "warning" | "ready" | "info";

export interface NextAction {
  tone: NextActionTone;
  title: string;
  description: string;
  /** Screen id to navigate to when the user clicks the CTA. */
  cta: { label: string; screen: string };
}

interface Input {
  isTauri: boolean;
  scanResult: ScanResult | null;
  routerResult: RouterScanResult | null;
  easData: EasData | null;
  easAuth: EasAuthStatus | null;
  environment: string;
  credentials: CredentialsReport | null;
  bundleHistory: BundleSizeSnapshot[];
}

/**
 * Pick the single most important thing the user should do next.
 * The order encodes the ship-confidence priority: auth → critical scan
 * issues → SDK → OTA safety → build freshness → all-clear.
 */
export function computeNextAction({
  isTauri,
  scanResult,
  routerResult,
  easData,
  easAuth,
  environment,
  credentials,
  bundleHistory,
}: Input): NextAction | null {
  if (!scanResult) {
    return {
      tone: "info",
      title: "Scan your project to begin",
      description: "ExpoPilot will read your project files locally and check ship readiness.",
      cta: { label: "Go to Project Health", screen: "health" },
    };
  }

  const critical = scanResult.issues.filter((i) => i.severity === "critical");
  if (critical.length > 0) {
    const first = critical[0];
    return {
      tone: "critical",
      title: `Fix ${critical.length} critical issue${critical.length === 1 ? "" : "s"} before shipping`,
      description: `${first.title}${first.suggestedFix ? ` - ${first.suggestedFix}` : ""}`,
      cta: { label: "Review issues", screen: "health" },
    };
  }

  const credAction = creditCredentialAction(credentials);
  if (credAction && (credAction.tone === "critical" || credAction.tone === "warning")) {
    // Critical creds (expired or ≤7 days) outrank everything except scan-criticals;
    // warning creds sit below SDK gap (handled by ordering below).
    if (credAction.tone === "critical") return credAction;
  }

  if (isTauri && (easAuth?.state === "not-logged-in" || easAuth?.state === "cli-not-found")) {
    return {
      tone: "warning",
      title:
        easAuth.state === "cli-not-found"
          ? "Install the EAS CLI to enable builds & updates"
          : "Log in to EAS to enable builds & updates",
      description:
        easAuth.state === "cli-not-found"
          ? "Run npm install -g eas-cli in your terminal, then refresh."
          : "Run eas login in your terminal so ExpoPilot can read build and update history.",
      cta: { label: "Open Settings", screen: "settings" },
    };
  }

  if (credAction && credAction.tone === "warning") return credAction;

  // Expo Router enabled but no `scheme` configured → custom deep links can't
  // open the app. Only flag this when the project actually uses Expo Router,
  // since plain RN apps without routes don't necessarily need a scheme.
  if (
    scanResult.metadata.expoRouterEnabled &&
    routerResult &&
    !routerResult.urlScheme &&
    routerResult.routes.length > 0
  ) {
    return {
      tone: "warning",
      title: "URL scheme not configured",
      description:
        "Expo Router routes exist but app.json has no scheme - deep links from emails, push notifications, QR codes, and OAuth callbacks won't open your app.",
      cta: { label: "Open Router", screen: "router" },
    };
  }

  const bundleAction = creditBundleAction(bundleHistory);
  if (bundleAction) return bundleAction;

  const sdk = getExpoSdkStatus(scanResult.sdkVersion);
  if (sdk.isDetected && !sdk.isLatest && sdk.latestMajor && sdk.currentMajor) {
    const gap = sdk.latestMajor - sdk.currentMajor;
    if (gap >= 2) {
      return {
        tone: "warning",
        title: `Upgrade Expo SDK (${gap} major versions behind)`,
        description: `You're on SDK ${sdk.currentMajor}, latest is ${sdk.latestMajor}. Older SDKs lose store submission support and security fixes.`,
        cta: { label: "Review SDK", screen: "health" },
      };
    }
  }

  if (easData) {
    const compat: UpdateCompatibility | undefined = easData.compatibility?.compatibility;
    if (compat?.status === "not-compatible") {
      const reason = !compat.runtimeVersionMatch
        ? "Runtime version doesn't match your latest build - devices on production won't receive this update."
        : !compat.branchMatch || !compat.channelMatch
          ? `Latest update isn't published to the ${environment} branch.`
          : "Update is incompatible with your latest build.";
      return {
        tone: "critical",
        title: "Your latest update won't reach production users",
        description: reason,
        cta: { label: "Inspect Updates", screen: "updates" },
      };
    }

    const finishedBuilds = easData.builds.filter((b) => b.status === "finished");
    const erroredFirst = isFirstBuildErrored(easData.builds);
    if (erroredFirst) {
      return {
        tone: "critical",
        title: "Your most recent build failed",
        description: "Open Builds to view the log and the auto-detected root cause.",
        cta: { label: "Open Builds", screen: "builds" },
      };
    }

    if (finishedBuilds.length === 0 && easData.builds.length === 0) {
      return {
        tone: "info",
        title: "No EAS builds yet - start your first build",
        description: "Use Deploy in the top bar to kick off a build with a profile of your choice.",
        cta: { label: "Open Builds", screen: "builds" },
      };
    }
  }

  return {
    tone: "ready",
    title: "Ready to ship",
    description:
      "All critical checks pass. Run Verify Before Build for the final pre-flight sweep before submitting.",
    cta: { label: "Verify ship readiness", screen: "health" },
  };
}

function creditCredentialAction(credentials: CredentialsReport | null): NextAction | null {
  if (!credentials) return null;
  const profiles = credentials.provisioningProfiles;
  if (profiles.length === 0) return null;

  const worst = [...profiles].sort(
    (a, b) => (a.daysUntilExpiry ?? 9_999) - (b.daysUntilExpiry ?? 9_999),
  )[0];
  const days = worst.daysUntilExpiry;
  const label = worst.name ?? worst.appIdName ?? "A provisioning profile";

  if (worst.expirationStatus === "expired") {
    return {
      tone: "critical",
      title: `${label} has expired`,
      description:
        "App Store submissions and TestFlight uploads will fail until this provisioning profile is renewed.",
      cta: { label: "Open Credentials", screen: "credentials" },
    };
  }
  if (worst.expirationStatus === "critical" && days !== undefined) {
    return {
      tone: "critical",
      title: `${label} expires in ${days} day${days === 1 ? "" : "s"}`,
      description: "Renew this provisioning profile before your next build - it's the silent killer of Friday releases.",
      cta: { label: "Open Credentials", screen: "credentials" },
    };
  }
  if (worst.expirationStatus === "warning" && days !== undefined) {
    return {
      tone: "warning",
      title: `${label} expires in ${days} days`,
      description: "Plan a credential refresh in the next few weeks to keep builds healthy.",
      cta: { label: "Open Credentials", screen: "credentials" },
    };
  }
  return null;
}

function creditBundleAction(history: BundleSizeSnapshot[]): NextAction | null {
  if (history.length < 2) return null;
  const prev = history[history.length - 2];
  const curr = history[history.length - 1];
  // Only warn on growth - shrinking is good news.
  if (curr.totalBytes <= prev.totalBytes) return null;
  const delta = computeBundleDelta(prev.totalBytes, curr.totalBytes);
  if (delta.severity !== "critical") return null;
  const pct = (delta.percentDelta * 100).toFixed(0);
  return {
    tone: "warning",
    title: `Bundle grew ${pct}% since the last measurement`,
    description: `Up ${formatBytes(delta.absoluteDelta)} to ${formatBytes(curr.totalBytes)}. Open Bundle size to see which files account for the jump.`,
    cta: { label: "Open Bundle size", screen: "bundle" },
  };
}

function isFirstBuildErrored(builds: BuildRecord[]): boolean {
  const sorted = [...builds].sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  return sorted[0]?.status === "errored";
}
