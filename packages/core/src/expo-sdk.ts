/** Latest stable Expo SDK major version. Update with each Expo release. */
export const LATEST_EXPO_SDK_MAJOR = 55;

export function getExpoSdkMajor(sdkVersion: string | undefined | null): number | null {
  if (!sdkVersion) return null;
  const match = sdkVersion.match(/^(\d+)/);
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  return Number.isNaN(major) ? null : major;
}

export interface ExpoSdkStatus {
  sdkVersion: string | null;
  currentMajor: number | null;
  latestMajor: number;
  isLatest: boolean;
  isDetected: boolean;
}

export function getExpoSdkStatus(sdkVersion: string | undefined | null): ExpoSdkStatus {
  const currentMajor = getExpoSdkMajor(sdkVersion ?? null);
  const latestMajor = LATEST_EXPO_SDK_MAJOR;

  return {
    sdkVersion: sdkVersion ?? null,
    currentMajor,
    latestMajor,
    isLatest: currentMajor !== null && currentMajor >= latestMajor,
    isDetected: currentMajor !== null,
  };
}

export function getExpoSdkUpgradeCommand(latestMajor = LATEST_EXPO_SDK_MAJOR): string {
  return `npx expo install expo@^${latestMajor}.0.0`;
}
