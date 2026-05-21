import type {
  DeployReadiness,
  DeployRequirement,
  DeployStore,
  ExpoDoctorResult,
  Issue,
  ReleaseReadiness,
  ScanResult,
} from "../types/index.js";
import type { EasJsonConfig } from "../eas/parsers.js";

export type { DeployStore, DeployRequirement, DeployRequirementStatus, DeployReadiness } from "../types/index.js";

const STORE_LABELS: Record<DeployStore, string> = {
  ios: "App Store / TestFlight",
  android: "Google Play",
};

export function getDeployStoreLabel(store: DeployStore): string {
  return STORE_LABELS[store];
}

export function getDeployCommand(store: DeployStore, profile = "production"): string {
  const platform = store === "ios" ? "ios" : "android";
  return `eas build -p ${platform} --profile ${profile} --submit --non-interactive`;
}

interface EvaluateDeployReadinessInput {
  store: DeployStore;
  profile?: string;
  scanResult: ScanResult | null;
  releaseReadiness: ReleaseReadiness | null;
  expoDoctor: ExpoDoctorResult | null;
  easJson: EasJsonConfig | null;
  gitClean: boolean;
  easLoggedIn: boolean;
}

type IssuePlatformScope = DeployStore | "both";

const CHECKLIST_ITEM_PLATFORMS: Record<string, IssuePlatformScope> = {
  icon: "both",
  splash: "both",
  "build-number": "both",
  permissions: "both",
  privacy: "ios",
  "android-perms": "android",
  "update-compat": "both",
  changelog: "both",
  screenshots: "both",
  credentials: "both",
};

function getIssuePlatformScope(issue: Issue): IssuePlatformScope {
  const text = `${issue.title} ${issue.category} ${issue.description ?? ""} ${issue.suggestedFix ?? ""}`.toLowerCase();
  const mentionsAndroid =
    /\bandroid\b/.test(text) ||
    text.includes("google play") ||
    text.includes("play store") ||
    text.includes("google-services");
  const mentionsIos =
    /\bios\b/.test(text) ||
    text.includes("bundle identifier") ||
    text.includes("app store") ||
    text.includes("testflight") ||
    text.includes("privacyinfo") ||
    text.includes("xcprivacy");

  if (mentionsAndroid && !mentionsIos) return "android";
  if (mentionsIos && !mentionsAndroid) return "ios";
  return "both";
}

function issueAppliesToStore(issue: Issue, store: DeployStore): boolean {
  const scope = getIssuePlatformScope(issue);
  return scope === "both" || scope === store;
}

function checklistItemAppliesToStore(itemId: string, store: DeployStore): boolean {
  const scope = CHECKLIST_ITEM_PLATFORMS[itemId] ?? "both";
  return scope === "both" || scope === store;
}

function checklistDescriptionForStore(
  itemId: string,
  store: DeployStore,
  description?: string,
): string | undefined {
  if (itemId === "screenshots") {
    return store === "ios" ? "Add App Store screenshots" : "Add Google Play screenshots";
  }
  return description;
}

function hasCriticalIssues(issues: Issue[], store: DeployStore): boolean {
  return issues.some(
    (issue) => issue.severity === "critical" && issueAppliesToStore(issue, store),
  );
}

function platformScanBlockers(store: DeployStore, issues: Issue[]): DeployRequirement[] {
  const blockers = issues.filter(
    (issue) =>
      issue.severity !== "passed" &&
      issueAppliesToStore(issue, store) &&
      getIssuePlatformScope(issue) === store,
  );

  if (blockers.length === 0) {
    return [
      {
        id: `${store}-config`,
        label: store === "ios" ? "iOS app configuration" : "Android app configuration",
        status: "pass",
      },
    ];
  }

  return blockers.map((issue) => ({
    id: issue.id,
    label: issue.title,
    status: issue.severity === "critical" ? "fail" : "warn",
    description: issue.suggestedFix ?? issue.description,
  }));
}

export function evaluateDeployReadiness(input: EvaluateDeployReadinessInput): DeployReadiness {
  const profile = input.profile ?? "production";
  const requirements: DeployRequirement[] = [];
  const issues = input.scanResult?.issues ?? [];

  requirements.push({
    id: "git-clean",
    label: "Git working tree is clean",
    status: input.gitClean ? "pass" : "fail",
    description: input.gitClean ? undefined : "Commit or stash changes before store submission.",
  });

  requirements.push({
    id: "eas-login",
    label: "Signed in to EAS",
    status: input.easLoggedIn ? "pass" : "fail",
    description: input.easLoggedIn ? undefined : "Run eas login in your terminal.",
  });

  const hasProductionProfile = Boolean(input.easJson?.build?.[profile]);
  requirements.push({
    id: "build-profile",
    label: `EAS build profile "${profile}"`,
    status: hasProductionProfile ? "pass" : "fail",
    description: hasProductionProfile ? undefined : `Add a "${profile}" profile to eas.json.`,
  });

  const submitProfile = input.easJson?.submit?.[profile];
  const hasSubmitConfig =
    input.store === "ios" ? Boolean(submitProfile?.ios) : Boolean(submitProfile?.android);
  requirements.push({
    id: "submit-profile",
    label: `EAS submit config for ${getDeployStoreLabel(input.store)}`,
    status: hasSubmitConfig ? "pass" : "warn",
    description: hasSubmitConfig
      ? undefined
      : `Add submit.${profile}.${input.store} to eas.json or configure credentials during submit.`,
  });

  requirements.push({
    id: "critical-issues",
    label: "No critical project health issues",
    status: hasCriticalIssues(issues, input.store) ? "fail" : "pass",
    description: hasCriticalIssues(issues, input.store)
      ? "Fix critical issues on the Project Health screen first."
      : undefined,
  });

  requirements.push(...platformScanBlockers(input.store, issues));

  if (input.expoDoctor) {
    if (input.expoDoctor.status === "error") {
      requirements.push({
        id: "expo-doctor",
        label: "Expo Doctor",
        status: "warn",
        description: input.expoDoctor.error ?? "Expo Doctor could not run.",
      });
    } else if (input.expoDoctor.status === "failed") {
      requirements.push({
        id: "expo-doctor",
        label: "Expo Doctor checks",
        status: "warn",
        description: `${input.expoDoctor.checks.length} failed check(s). Review on Project Health.`,
      });
    } else {
      requirements.push({
        id: "expo-doctor",
        label: "Expo Doctor checks",
        status: "pass",
        description: `${input.expoDoctor.passed}/${input.expoDoctor.total} checks passed.`,
      });
    }
  } else {
    requirements.push({
      id: "expo-doctor",
      label: "Expo Doctor checks",
      status: "warn",
      description: "Run a project scan to execute Expo Doctor before deploying.",
    });
  }

  const checklist = input.releaseReadiness?.checklist ?? [];
  for (const item of checklist) {
    if (item.status === "na" || !checklistItemAppliesToStore(item.id, input.store)) continue;
    requirements.push({
      id: `checklist-${item.id}`,
      label: item.label,
      status: item.status === "done" ? "pass" : item.status === "warning" ? "warn" : "warn",
      description: checklistDescriptionForStore(item.id, input.store, item.description),
    });
  }

  if (input.store === "ios") {
    requirements.push({
      id: "store-testflight",
      label: "TestFlight / App Store Connect",
      status: "warn",
      description:
        "Build will upload to App Store Connect and appear in TestFlight after Apple processing.",
    });
  } else {
    requirements.push({
      id: "store-play",
      label: "Google Play Console",
      status: "warn",
      description:
        "Build will upload to Google Play. Promote from internal testing to production in Play Console.",
    });
  }

  const canDeploy = requirements.every((req) => req.status !== "fail");
  const hasWarnings = requirements.some((req) => req.status === "warn");

  return {
    store: input.store,
    profile,
    requirements,
    canDeploy,
    hasWarnings,
    command: getDeployCommand(input.store, profile),
  };
}
