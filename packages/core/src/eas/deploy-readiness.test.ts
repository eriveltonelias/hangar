import { describe, it, expect } from "vitest";
import { getDeployCommand, getDeployStoreLabel } from "./deploy-readiness.js";

describe("getDeployStoreLabel", () => {
  it("labels each store", () => {
    expect(getDeployStoreLabel("ios")).toBe("App Store / TestFlight");
    expect(getDeployStoreLabel("android")).toBe("Google Play");
  });
});

describe("getDeployCommand", () => {
  it("defaults to production profile", () => {
    expect(getDeployCommand("ios")).toBe(
      "eas build -p ios --profile production --submit --non-interactive",
    );
    expect(getDeployCommand("android")).toBe(
      "eas build -p android --profile production --submit --non-interactive",
    );
  });

  it("honors a custom profile", () => {
    expect(getDeployCommand("ios", "preview")).toBe(
      "eas build -p ios --profile preview --submit --non-interactive",
    );
  });
});
