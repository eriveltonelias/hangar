import type { BundleSizeRaw, BundleSizeReport, BundleSizeSnapshot } from "@hangar/core";
import { buildBundleReport } from "@hangar/core";
import { isTauri } from "./platform";
import { formatError } from "./errors";

const HISTORY_PREFIX = "hangar-bundle-history:";
const MAX_HISTORY = 50;

function historyKey(projectPath: string): string {
  return `${HISTORY_PREFIX}${projectPath}`;
}

export function loadBundleHistory(projectPath?: string): BundleSizeSnapshot[] {
  if (!projectPath) return [];
  try {
    const raw = localStorage.getItem(historyKey(projectPath));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

export function appendBundleHistory(
  projectPath: string,
  snapshot: BundleSizeSnapshot,
): BundleSizeSnapshot[] {
  const history = loadBundleHistory(projectPath);
  // De-dup: if the most recent entry is from the same day with the same total, replace it.
  const today = snapshot.date.slice(0, 10);
  const last = history[history.length - 1];
  if (
    last &&
    last.date.slice(0, 10) === today &&
    last.totalBytes === snapshot.totalBytes &&
    last.fileCount === snapshot.fileCount
  ) {
    history[history.length - 1] = snapshot;
  } else {
    history.push(snapshot);
  }
  const trimmed = history.slice(-MAX_HISTORY);
  try {
    localStorage.setItem(historyKey(projectPath), JSON.stringify(trimmed));
  } catch {
    /* localStorage full - drop silently */
  }
  return trimmed;
}

/**
 * Scan returns null when no bundle output directory exists yet. The screen
 * should prompt the user to run `npx expo export` in that case.
 */
export async function scanBundle(projectPath: string): Promise<BundleSizeReport | null> {
  if (!isTauri()) return null;

  const { invoke } = await import("@tauri-apps/api/core");
  try {
    const raw = await invoke<BundleSizeRaw | null>("scan_bundle_size", { projectPath });
    if (!raw) return null;
    return buildBundleReport(raw, new Date().toISOString());
  } catch (err) {
    throw new Error(formatError(err));
  }
}
