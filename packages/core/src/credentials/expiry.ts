import type {
  CredentialsHealthStatus,
  CredentialsReport,
  CredentialsScanRaw,
  MobileProvisionInfo,
} from "../types/index.js";

const SEVERITY: Record<CredentialsHealthStatus, number> = {
  expired: 4,
  critical: 3,
  warning: 2,
  unknown: 1,
  ok: 0,
};

export function statusFromDays(daysUntilExpiry: number | undefined): CredentialsHealthStatus {
  if (daysUntilExpiry === undefined) return "unknown";
  if (daysUntilExpiry <= 0) return "expired";
  if (daysUntilExpiry <= 7) return "critical";
  if (daysUntilExpiry <= 30) return "warning";
  return "ok";
}

export function daysUntil(iso: string | undefined, nowMs = Date.now()): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  return Math.floor((t - nowMs) / 86_400_000);
}

export function annotateMobileProvision(
  raw: MobileProvisionInfo,
  nowMs = Date.now(),
): MobileProvisionInfo {
  const days = daysUntil(raw.expiresAt, nowMs);
  return {
    ...raw,
    daysUntilExpiry: days,
    expirationStatus: statusFromDays(days),
  };
}

export function buildCredentialsReport(
  raw: CredentialsScanRaw,
  nowMs = Date.now(),
): CredentialsReport {
  const provisioningProfiles = raw.provisioningProfiles.map((p) =>
    annotateMobileProvision(p, nowMs),
  );

  const worstStatus = provisioningProfiles.reduce<CredentialsHealthStatus>(
    (acc, p) => (SEVERITY[p.expirationStatus] > SEVERITY[acc] ? p.expirationStatus : acc),
    "ok",
  );

  // If nothing local was discovered at all, the user is most likely on EAS-managed creds.
  const hasAnyLocal =
    raw.hasCredentialsJson ||
    provisioningProfiles.length > 0 ||
    raw.keystores.length > 0 ||
    raw.iosCertificates.length > 0;

  return {
    ...raw,
    provisioningProfiles,
    worstStatus: hasAnyLocal ? worstStatus : "unknown",
    managedByEas: !hasAnyLocal,
  };
}
