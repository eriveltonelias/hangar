import type { ScanResult, RouterScanResult, ExpoDoctorResult, ExpoConfigResult, AppSettings, SavedProject } from "@expopilot/core";
import { computeUpdateCompatibility, buildReleaseReadiness } from "@expopilot/core";
import {
  loadSettings,
  saveSettings,
  getActiveProjectPath,
  getSavedProjects,
} from "../services";
import { applyActiveProject, projectFolderName, sortProjectsByRecent } from "../projects";
import { isTauri } from "../platform";
import {
  saveProjectCache,
  saveEasCache,
  PROJECT_CACHE_VERSION,
  EAS_CACHE_VERSION,
} from "../project-cache";
import type { EasData } from "../eas-service";

export function recomputeEasDerived(
  easData: EasData,
  scanResult: ScanResult | null,
  environment: string,
): EasData {
  const compatibility = computeUpdateCompatibility(easData.builds, easData.updates, environment);
  const releaseReadiness = buildReleaseReadiness(
    scanResult,
    easData.builds,
    easData.updates,
    environment,
  );
  return { ...easData, compatibility, releaseReadiness };
}

export function persistActiveProject(
  settings: AppSettings,
  path: string,
  name?: string,
): AppSettings {
  const next = applyActiveProject(settings, path, name);
  saveSettings(next);
  return next;
}

export async function persistProjectSnapshot(
  path: string,
  scanResult: ScanResult,
  routerResult: RouterScanResult,
  expoDoctor: ExpoDoctorResult | null,
  expoConfig?: ExpoConfigResult | null,
): Promise<void> {
  await saveProjectCache({
    version: PROJECT_CACHE_VERSION,
    projectPath: path,
    scanResult,
    routerResult,
    expoDoctor,
    expoConfig: expoConfig ?? null,
    cachedAt: new Date().toISOString(),
  });
}

export async function persistEasSnapshot(path: string, easData: EasData): Promise<void> {
  await saveEasCache({
    version: EAS_CACHE_VERSION,
    projectPath: path,
    easData,
    cachedAt: new Date().toISOString(),
  });
}

export interface InitialState {
  settings: AppSettings;
  projects: SavedProject[];
  projectPath: string | null;
  projectName: string | null;
}

export function computeInitialState(): InitialState {
  const settings = loadSettings();
  const projectPath = isTauri() ? getActiveProjectPath(settings) ?? null : null;
  const projects = sortProjectsByRecent(getSavedProjects(settings));
  const projectName = projectPath ? projectFolderName(projectPath) : null;

  return { settings, projects, projectPath, projectName };
}
