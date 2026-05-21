import type { AppSettings, SavedProject } from "@expopilot/core";

export function projectFolderName(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function normalizeProjectSettings(settings: AppSettings): AppSettings {
  let projects = settings.projects ?? [];
  let activeProjectPath = settings.activeProjectPath;

  // Legacy migration: only when projects were never persisted
  if (settings.projects === undefined && settings.projectPath) {
    projects = [
      {
        path: settings.projectPath,
        name: projectFolderName(settings.projectPath),
        addedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      },
    ];
    activeProjectPath = settings.projectPath;
  }

  if (
    activeProjectPath &&
    projects.length > 0 &&
    !projects.some((p) => p.path === activeProjectPath)
  ) {
    projects = [
      ...projects,
      {
        path: activeProjectPath,
        name: projectFolderName(activeProjectPath),
        addedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      },
    ];
  }

  if (projects.length === 0) {
    activeProjectPath = undefined;
  }

  return {
    ...settings,
    projectPath: undefined,
    projects,
    activeProjectPath,
    theme:
      settings.theme === "light" || settings.theme === "system" || settings.theme === "dark"
        ? settings.theme
        : "dark",
  };
}

export function getSavedProjects(settings: AppSettings): SavedProject[] {
  return normalizeProjectSettings(settings).projects ?? [];
}

export function getActiveProjectPath(settings: AppSettings): string | undefined {
  const normalized = normalizeProjectSettings(settings);
  return normalized.activeProjectPath ?? normalized.projects?.[0]?.path;
}

export function upsertProject(
  projects: SavedProject[],
  path: string,
  name = projectFolderName(path),
): SavedProject[] {
  const now = new Date().toISOString();
  const existing = projects.find((p) => p.path === path);
  if (existing) {
    return projects.map((p) =>
      p.path === path ? { ...p, name: name || p.name, lastOpenedAt: now } : p,
    );
  }
  return [...projects, { path, name, addedAt: now, lastOpenedAt: now }];
}

export function removeProjectFromList(projects: SavedProject[], path: string): SavedProject[] {
  return projects.filter((p) => p.path !== path);
}

export function renameProjectInList(
  projects: SavedProject[],
  path: string,
  name: string,
): SavedProject[] {
  return projects.map((p) => (p.path === path ? { ...p, name } : p));
}

export function sortProjectsByRecent(projects: SavedProject[]): SavedProject[] {
  return [...projects].sort((a, b) => {
    const aTime = a.lastOpenedAt ?? a.addedAt;
    const bTime = b.lastOpenedAt ?? b.addedAt;
    return bTime.localeCompare(aTime);
  });
}

export function applyActiveProject(
  settings: AppSettings,
  path: string,
  name?: string,
): AppSettings {
  const projects = upsertProject(getSavedProjects(settings), path, name);
  return normalizeProjectSettings({
    ...settings,
    projects,
    activeProjectPath: path,
  });
}

export function applyRemovedProject(settings: AppSettings, path: string): AppSettings {
  const currentProjects = getSavedProjects(settings);
  const projects = removeProjectFromList(currentProjects, path);
  const wasActive = getActiveProjectPath(settings) === path;
  const remaining = sortProjectsByRecent(projects);
  const nextActive = wasActive ? remaining[0]?.path : getActiveProjectPath(settings);

  return normalizeProjectSettings({
    ...settings,
    projectPath: undefined,
    projects: remaining,
    activeProjectPath: nextActive,
  });
}
