import type { BuildRecord, UpdateRecord } from "@hangar/core";

export type UpdatePlatform = "ios" | "android";
export type DeliveryStatus = "will-deliver" | "wont-deliver" | "no-build" | "no-update";

export interface PlatformDelivery {
  platform: UpdatePlatform;
  status: DeliveryStatus;
  headline: string;
  detail: string;
  buildRuntime?: string;
  updateRuntime?: string;
  updateMessage?: string;
}

function pickLatestBuild(builds: BuildRecord[], platform: UpdatePlatform): BuildRecord | undefined {
  return builds
    .filter(
      (b) =>
        (b.platform === platform || b.platform === "all") && b.status === "finished",
    )
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
}

function pickLatestUpdate(
  updates: UpdateRecord[],
  platform: UpdatePlatform,
  branch: string,
): UpdateRecord | undefined {
  const branchKey = branch.toLowerCase();
  return updates
    .filter(
      (u) =>
        (u.platform === platform || u.platform === "all") &&
        (u.branch?.toLowerCase() === branchKey || u.channel?.toLowerCase() === branchKey),
    )
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
}

/**
 * Translate the EAS build × update matrix into a per-platform plain-English
 * summary. Each sentence answers a single question: "will real users on
 * {iOS, Android} {environment} receive my latest OTA update?"
 */
export function computeDeliveryByPlatform(
  builds: BuildRecord[],
  updates: UpdateRecord[],
  environment: string,
): PlatformDelivery[] {
  return (["ios", "android"] as const).map((platform) => {
    const build = pickLatestBuild(builds, platform);
    const update = pickLatestUpdate(updates, platform, environment);

    if (!build) {
      return {
        platform,
        status: "no-build",
        headline: `No ${platform === "ios" ? "iOS" : "Android"} build for ${environment} yet`,
        detail: `Run a build to start receiving OTA updates on ${platform === "ios" ? "iOS" : "Android"} ${environment}.`,
      };
    }

    if (!update) {
      return {
        platform,
        status: "no-update",
        headline: `No update published for ${platform === "ios" ? "iOS" : "Android"} ${environment}`,
        detail: `Your build is live, but no OTA update has been published to the ${environment} branch yet.`,
        buildRuntime: build.runtimeVersion,
      };
    }

    const buildRuntime = build.runtimeVersion;
    const updateRuntime = update.runtimeVersion;
    const runtimeMatches = !buildRuntime || !updateRuntime || buildRuntime === updateRuntime;

    if (!runtimeMatches) {
      return {
        platform,
        status: "wont-deliver",
        headline: `${platform === "ios" ? "iOS" : "Android"} ${environment} users will NOT receive your latest update`,
        detail: `Runtime version mismatch - build is ${buildRuntime}, update is ${updateRuntime}. You need a new build (or republish the update under runtime ${buildRuntime}).`,
        buildRuntime,
        updateRuntime,
        updateMessage: update.message,
      };
    }

    return {
      platform,
      status: "will-deliver",
      headline: `${platform === "ios" ? "iOS" : "Android"} ${environment} users WILL receive your latest update`,
      detail: `Build and update both on runtime ${updateRuntime}. Update: "${update.message}".`,
      buildRuntime,
      updateRuntime,
      updateMessage: update.message,
    };
  });
}
