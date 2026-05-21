import { describe, it, expect } from "vitest";
import {
  LATEST_EXPO_SDK_MAJOR,
  getExpoSdkMajor,
  getExpoSdkStatus,
  getExpoSdkUpgradeCommand,
} from "./expo-sdk.js";

describe("getExpoSdkMajor", () => {
  it.each([
    ["55.0.0", 55],
    ["54.0.7", 54],
    ["50", 50],
    ["54.0.0-canary.1", 54],
  ])("parses %s → %s", (input, expected) => {
    expect(getExpoSdkMajor(input)).toBe(expected);
  });

  it("returns null for invalid input", () => {
    expect(getExpoSdkMajor(null)).toBeNull();
    expect(getExpoSdkMajor(undefined)).toBeNull();
    expect(getExpoSdkMajor("")).toBeNull();
    expect(getExpoSdkMajor("not-a-version")).toBeNull();
  });
});

describe("getExpoSdkStatus", () => {
  it("flags isLatest when at-or-above LATEST_EXPO_SDK_MAJOR", () => {
    const latest = getExpoSdkStatus(`${LATEST_EXPO_SDK_MAJOR}.0.0`);
    expect(latest.isLatest).toBe(true);
    expect(latest.isDetected).toBe(true);
    expect(latest.currentMajor).toBe(LATEST_EXPO_SDK_MAJOR);
    expect(latest.latestMajor).toBe(LATEST_EXPO_SDK_MAJOR);
  });

  it("flags isLatest=false when behind", () => {
    const old = getExpoSdkStatus("49.0.0");
    expect(old.isLatest).toBe(false);
    expect(old.isDetected).toBe(true);
  });

  it("reports not-detected when no version is given", () => {
    const none = getExpoSdkStatus(null);
    expect(none.isDetected).toBe(false);
    expect(none.isLatest).toBe(false);
    expect(none.currentMajor).toBeNull();
    expect(none.sdkVersion).toBeNull();
  });
});

describe("getExpoSdkUpgradeCommand", () => {
  it("defaults to the latest major", () => {
    expect(getExpoSdkUpgradeCommand()).toBe(`npx expo install expo@^${LATEST_EXPO_SDK_MAJOR}.0.0`);
  });

  it("accepts an override", () => {
    expect(getExpoSdkUpgradeCommand(60)).toBe("npx expo install expo@^60.0.0");
  });
});
