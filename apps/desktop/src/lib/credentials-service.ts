import type { CredentialsReport, CredentialsScanRaw } from "@hangar/core";
import { buildCredentialsReport } from "@hangar/core";
import { isTauri } from "./platform";
import { formatError } from "./errors";

export async function scanCredentials(projectPath: string): Promise<CredentialsReport> {
  const now = new Date().toISOString();

  if (!isTauri()) {
    return buildCredentialsReport({
      scannedAt: now,
      hasCredentialsJson: false,
      credentialsJson: null,
      provisioningProfiles: [],
      keystores: [],
      iosCertificates: [],
    });
  }

  const { invoke } = await import("@tauri-apps/api/core");
  try {
    const raw = await invoke<CredentialsScanRaw>("scan_credentials", { projectPath });
    return buildCredentialsReport({ ...raw, scannedAt: now });
  } catch (err) {
    throw new Error(formatError(err));
  }
}
