import type { DeployStore } from "../types/index.js";
import type { EasJsonConfig } from "./parsers.js";

/**
 * How the dialog should ship to the store, given what's in eas.json.
 *
 * - "configured" - eas.json has a `submit.<profile>.<store>` block. We run
 *   `eas build --auto-submit-with-profile <profile>` and EAS handles the
 *   submission with the user's stored credentials.
 * - "testflight" - iOS-only fallback. No submit profile exists, but Apple
 *   distribution is still possible via `npx testflight`, which builds + uploads
 *   to TestFlight without requiring a pre-configured submit profile.
 *   See: https://docs.expo.dev/build-reference/npx-testflight/
 * - "missing" - Android with no submit profile. There's no zero-config
 *   equivalent of TestFlight for Play, so the dialog should block and point
 *   the user at the submit-profile docs.
 */
export type SubmitStrategy = "configured" | "testflight" | "missing";

export interface SubmitStrategyDetails {
  strategy: SubmitStrategy;
  /** Short human-readable label for the dialog ("EAS Submit profile · production", "TestFlight (zero-config)", etc). */
  label: string;
  /** One-sentence explanation of what's about to happen. */
  description: string;
  /** Required field names that are absent from eas.json (when applicable). */
  missingFields?: string[];
}

/**
 * Fields a complete iOS EAS Submit profile needs to run non-interactively.
 *
 * Strictly EAS could derive `appleId` and `appleTeamId` from EAS-managed
 * credentials, but in practice projects that bother to declare *any* of
 * these expect them all present, and missing them tends to surface as
 * confusing prompt-mid-CI errors. We treat the trio as the minimum bar for
 * "ready to submit without help"; anything less and we hand off to
 * `npx testflight`, which manages Apple creds on its own.
 */
const REQUIRED_IOS_SUBMIT_FIELDS = ["ascAppId", "appleId", "appleTeamId"] as const;

function iosMissingFields(ios: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_IOS_SUBMIT_FIELDS) {
    const value = ios[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      missing.push(field);
    }
  }
  return missing;
}

/**
 * Android submission needs either a service-account JSON file path or the
 * service-account object inline. Without one, `eas submit -p android` fails.
 */
function androidMissingFields(android: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const hasKeyPath =
    typeof android.serviceAccountKeyPath === "string" &&
    (android.serviceAccountKeyPath as string).length > 0;
  const hasInlineKey = typeof android.serviceAccountKey !== "undefined";
  if (!hasKeyPath && !hasInlineKey) {
    missing.push("serviceAccountKeyPath");
  }
  return missing;
}

export function getSubmitStrategy(
  easJson: EasJsonConfig | null,
  profile: string,
  store: DeployStore,
): SubmitStrategyDetails {
  const submitProfile = easJson?.submit?.[profile];
  const storeConfig = submitProfile?.[store];
  const hasAnyConfig = Boolean(storeConfig && Object.keys(storeConfig).length > 0);

  if (store === "ios") {
    if (!hasAnyConfig) {
      return {
        strategy: "testflight",
        label: "TestFlight (zero-config)",
        description:
          "Your eas.json has no submit profile for iOS, so ExpoPilot will use npx testflight - Expo's zero-config flow that builds and uploads to TestFlight. First run may prompt for Apple credentials.",
      };
    }
    const missing = iosMissingFields(storeConfig!);
    if (missing.length === 0) {
      return {
        strategy: "configured",
        label: `EAS Submit profile · ${profile}`,
        description: `Build with the ${profile} profile, then submit to the App Store using your eas.json submit.${profile}.ios credentials.`,
      };
    }
    // Partial iOS submit profile is a hard block from ExpoPilot specifically:
    // `npx testflight` works fine in a terminal because EAS detects the TTY
    // and prompts the user for the missing field (e.g. ascAppId). ExpoPilot
    // spawns commands as subprocesses with piped stdio - no TTY - so EAS
    // refuses to prompt and errors with "Set ascAppId in the submit profile
    // (eas.json) or re-run this command in interactive mode." The only fix
    // available from ExpoPilot today is to put the field in eas.json so the
    // command can run non-interactively.
    return {
      strategy: "missing",
      label: "iOS submit profile incomplete",
      description: `Your submit.${profile}.ios block is missing ${missing.join(", ")}. EAS needs ${missing.length === 1 ? "this" : "these"} field${missing.length === 1 ? "" : "s"} to submit non-interactively. ExpoPilot can't prompt for ${missing.length === 1 ? "it" : "them"} (no terminal attached to the subprocess), so add ${missing.length === 1 ? "the value" : "the values"} to eas.json once - then every future deploy works automatically. Running \`npx testflight\` directly in your terminal works for the same reason: it prompts you, ExpoPilot can't.`,
      missingFields: missing,
    };
  }

  // Android
  if (!hasAnyConfig) {
    return {
      strategy: "missing",
      label: "Submit profile missing",
      description: `Add a submit.${profile}.android block to your eas.json (service account key + track) before deploying to Google Play.`,
    };
  }
  const missing = androidMissingFields(storeConfig!);
  if (missing.length === 0) {
    return {
      strategy: "configured",
      label: `EAS Submit profile · ${profile}`,
      description: `Build with the ${profile} profile, then submit to Google Play using your eas.json submit.${profile}.android credentials.`,
    };
  }
  return {
    strategy: "missing",
    label: "Submit profile incomplete",
    description: `Your submit.${profile}.android block is missing ${missing.join(", ")}. Add it before deploying to Google Play.`,
    missingFields: missing,
  };
}
