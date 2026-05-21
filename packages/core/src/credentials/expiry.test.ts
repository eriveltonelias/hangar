import { describe, it, expect } from "vitest";
import {
  annotateMobileProvision,
  buildCredentialsReport,
  daysUntil,
  statusFromDays,
} from "./expiry.js";
import type { CredentialsScanRaw, MobileProvisionInfo } from "../types/index.js";

const NOW = Date.UTC(2026, 0, 1); // 2026-01-01

function isoDaysFromNow(d: number): string {
  return new Date(NOW + d * 86_400_000).toISOString();
}

describe("statusFromDays", () => {
  it("returns 'unknown' for undefined", () => {
    expect(statusFromDays(undefined)).toBe("unknown");
  });

  it("maps the cliff thresholds", () => {
    expect(statusFromDays(-1)).toBe("expired");
    expect(statusFromDays(0)).toBe("expired");
    expect(statusFromDays(1)).toBe("critical");
    expect(statusFromDays(7)).toBe("critical");
    expect(statusFromDays(8)).toBe("warning");
    expect(statusFromDays(30)).toBe("warning");
    expect(statusFromDays(31)).toBe("ok");
    expect(statusFromDays(365)).toBe("ok");
  });
});

describe("daysUntil", () => {
  it("returns undefined for missing or invalid input", () => {
    expect(daysUntil(undefined, NOW)).toBeUndefined();
    expect(daysUntil("not-a-date", NOW)).toBeUndefined();
  });

  it("computes whole days remaining", () => {
    expect(daysUntil(isoDaysFromNow(10), NOW)).toBe(10);
    expect(daysUntil(isoDaysFromNow(-5), NOW)).toBe(-5);
    expect(daysUntil(isoDaysFromNow(0), NOW)).toBe(0);
  });
});

describe("annotateMobileProvision", () => {
  it("adds daysUntilExpiry and expirationStatus", () => {
    const raw: MobileProvisionInfo = {
      filePath: "/p.mobileprovision",
      expiresAt: isoDaysFromNow(3),
      expirationStatus: "unknown",
    };
    const annotated = annotateMobileProvision(raw, NOW);
    expect(annotated.daysUntilExpiry).toBe(3);
    expect(annotated.expirationStatus).toBe("critical");
  });

  it("handles undated profiles gracefully", () => {
    const raw: MobileProvisionInfo = {
      filePath: "/p.mobileprovision",
      expirationStatus: "unknown",
    };
    const annotated = annotateMobileProvision(raw, NOW);
    expect(annotated.daysUntilExpiry).toBeUndefined();
    expect(annotated.expirationStatus).toBe("unknown");
  });
});

describe("buildCredentialsReport", () => {
  const emptyRaw: CredentialsScanRaw = {
    scannedAt: "2026-01-01T00:00:00Z",
    hasCredentialsJson: false,
    credentialsJson: null,
    provisioningProfiles: [],
    keystores: [],
    iosCertificates: [],
  };

  it("marks empty scans as EAS-managed", () => {
    const report = buildCredentialsReport(emptyRaw, NOW);
    expect(report.managedByEas).toBe(true);
    expect(report.worstStatus).toBe("unknown");
  });

  it("rolls up worstStatus across profiles", () => {
    const raw: CredentialsScanRaw = {
      ...emptyRaw,
      provisioningProfiles: [
        { filePath: "/a", expiresAt: isoDaysFromNow(60), expirationStatus: "unknown" },
        { filePath: "/b", expiresAt: isoDaysFromNow(3), expirationStatus: "unknown" }, // critical
        { filePath: "/c", expiresAt: isoDaysFromNow(45), expirationStatus: "unknown" },
      ],
    };
    const report = buildCredentialsReport(raw, NOW);
    expect(report.worstStatus).toBe("critical");
    expect(report.managedByEas).toBe(false);
  });

  it("treats expired profiles as the worst", () => {
    const raw: CredentialsScanRaw = {
      ...emptyRaw,
      provisioningProfiles: [
        { filePath: "/a", expiresAt: isoDaysFromNow(-1), expirationStatus: "unknown" },
        { filePath: "/b", expiresAt: isoDaysFromNow(3), expirationStatus: "unknown" },
      ],
    };
    const report = buildCredentialsReport(raw, NOW);
    expect(report.worstStatus).toBe("expired");
  });

  it("preserves keystores/iosCertificates and flips managedByEas", () => {
    const raw: CredentialsScanRaw = {
      ...emptyRaw,
      keystores: ["/keystore.jks"],
    };
    const report = buildCredentialsReport(raw, NOW);
    expect(report.managedByEas).toBe(false);
    expect(report.keystores).toEqual(["/keystore.jks"]);
  });
});
