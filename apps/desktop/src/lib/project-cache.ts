import type { ScanResult, RouterScanResult, ExpoDoctorResult, ExpoConfigResult } from "@expopilot/core";
import type { EasData } from "./eas-service";
import { isTauri } from "./platform";

export const PROJECT_CACHE_VERSION = 1;
export const EAS_CACHE_VERSION = 1;

export interface ProjectCacheSnapshot {
  version: typeof PROJECT_CACHE_VERSION;
  projectPath: string;
  scanResult: ScanResult;
  routerResult: RouterScanResult;
  expoDoctor: ExpoDoctorResult | null;
  expoConfig?: ExpoConfigResult | null;
  cachedAt: string;
}

export interface EasCacheSnapshot {
  version: typeof EAS_CACHE_VERSION;
  projectPath: string;
  easData: EasData;
  cachedAt: string;
}

const WEB_PROJECT_CACHE_PREFIX = "expopilot-project-cache:";
const WEB_EAS_CACHE_PREFIX = "expopilot-eas-cache:";

function webProjectCacheKey(projectPath: string): string {
  return `${WEB_PROJECT_CACHE_PREFIX}${projectPath}`;
}

function webEasCacheKey(projectPath: string): string {
  return `${WEB_EAS_CACHE_PREFIX}${projectPath}`;
}

async function readCacheFile(cacheKind: "project" | "eas", projectPath: string): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string | null>("read_cache", { projectPath, cacheKind });
  }
  const key =
    cacheKind === "project" ? webProjectCacheKey(projectPath) : webEasCacheKey(projectPath);
  return localStorage.getItem(key);
}

async function writeCacheFile(
  cacheKind: "project" | "eas",
  projectPath: string,
  content: string,
): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_cache", { projectPath, cacheKind, content });
    return;
  }
  const key =
    cacheKind === "project" ? webProjectCacheKey(projectPath) : webEasCacheKey(projectPath);
  localStorage.setItem(key, content);
}

async function deleteCacheFiles(projectPath: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_cache", { projectPath });
    return;
  }
  localStorage.removeItem(webProjectCacheKey(projectPath));
  localStorage.removeItem(webEasCacheKey(projectPath));
}

function parseProjectCache(raw: string, projectPath: string): ProjectCacheSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as ProjectCacheSnapshot;
    if (parsed.version !== PROJECT_CACHE_VERSION) return null;
    if (parsed.projectPath !== projectPath) return null;
    if (!parsed.scanResult || !parsed.routerResult) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseEasCache(raw: string, projectPath: string): EasCacheSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as EasCacheSnapshot;
    if (parsed.version !== EAS_CACHE_VERSION) return null;
    if (parsed.projectPath !== projectPath) return null;
    if (!parsed.easData) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadProjectCache(projectPath: string): Promise<ProjectCacheSnapshot | null> {
  const raw = await readCacheFile("project", projectPath);
  if (!raw) return null;
  return parseProjectCache(raw, projectPath);
}

export async function saveProjectCache(snapshot: ProjectCacheSnapshot): Promise<void> {
  await writeCacheFile("project", snapshot.projectPath, JSON.stringify(snapshot));
}

export async function loadEasCache(projectPath: string): Promise<EasCacheSnapshot | null> {
  const raw = await readCacheFile("eas", projectPath);
  if (!raw) return null;
  return parseEasCache(raw, projectPath);
}

export async function saveEasCache(snapshot: EasCacheSnapshot): Promise<void> {
  await writeCacheFile("eas", snapshot.projectPath, JSON.stringify(snapshot));
}

export async function deleteProjectCache(projectPath: string): Promise<void> {
  await deleteCacheFiles(projectPath);
}
