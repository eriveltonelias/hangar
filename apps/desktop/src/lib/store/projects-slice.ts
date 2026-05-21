import { saveSettings, loadHealthHistory, selectProjectFolder, getActiveProjectPath, getSavedProjects } from "../services";
import { loadBundleHistory } from "../bundle-service";
import {
  applyRemovedProject,
  normalizeProjectSettings,
  projectFolderName,
  sortProjectsByRecent,
} from "../projects";
import { applyTheme, watchSystemTheme } from "../theme";
import { isTauri } from "../platform";
import { resetTour } from "../onboarding";
import { formatError } from "../errors";
import { deleteProjectCache } from "../project-cache";
import { stopProjectWatch, startProjectWatch } from "../project-watch";
import type { GetState, ProjectsSlice, SetState } from "./types";
import { persistActiveProject, type InitialState } from "./helpers";

export function createProjectsSlice(
  set: SetState,
  get: GetState,
  init: InitialState,
): ProjectsSlice {
  return {
    settings: init.settings,
    projects: init.projects,
    projectPath: init.projectPath,
    projectName: init.projectName,
    isSelectingProject: false,
    projectPendingRemoval: null,
    isRemovingProject: false,

    setSettings: (nextSettings) => {
      const normalized = normalizeProjectSettings({ ...get().settings, ...nextSettings });
      saveSettings(normalized);
      if (normalized.theme !== get().settings.theme) {
        applyTheme(normalized.theme);
        watchSystemTheme(normalized.theme);
      }
      set({
        settings: normalized,
        projects: sortProjectsByRecent(getSavedProjects(normalized)),
      });
    },

    addProject: async () => {
      if (get().isSelectingProject || get().isScanning) return;

      set({ isSelectingProject: true, scanError: null });
      try {
        const path = await selectProjectFolder();
        if (!path) return;

        if (isTauri()) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("validate_project_folder", { path });
        }

        const settings = persistActiveProject(get().settings, path);
        set({
          settings,
          projects: sortProjectsByRecent(getSavedProjects(settings)),
          projectPath: path,
          projectName: projectFolderName(path),
          scanResult: null,
          routerResult: null,
          easData: null,
          credentials: null,
          bundle: null,
          healthHistory: loadHealthHistory(path),
          bundleHistory: loadBundleHistory(path),
          isSelectingProject: false,
        });

        await get().scanAndCacheProject(path, { blocking: true });
        await startProjectWatch(path, () => {
          void get().refreshProjectFromWatch(path);
        });

        if (get().projects.length >= 1) {
          set({ activeScreen: "dashboard" });
        }

        // Note: the onboarding-tour trigger is no longer inline here. App.tsx
        // watches `projects.length` transitioning 0 → ≥1 and starts the tour,
        // so any pathway that adds a project (CLI import, drop zone, etc.)
        // gets the same first-run treatment.
      } catch (err) {
        set({ scanError: formatError(err) || "Failed to open project" });
      } finally {
        set({ isSelectingProject: false });
      }
    },

    switchProject: async (path) => {
      if (get().isScanning || get().isSelectingProject) return;
      if (get().projectPath === path && get().scanResult) return;

      const settings = persistActiveProject(get().settings, path);
      const projects = sortProjectsByRecent(getSavedProjects(settings));
      const project = projects.find((p) => p.path === path);

      set({
        settings,
        projects,
        projectPath: path,
        projectName: project?.name ?? projectFolderName(path),
        healthHistory: loadHealthHistory(path),
        bundleHistory: loadBundleHistory(path),
        bundle: null,
        scanError: null,
        easError: null,
      });

      await get().hydrateProject(path);
    },

    requestRemoveProject: (path) => {
      const project = get().projects.find((p) => p.path === path);
      if (!project) return;
      set({ projectPendingRemoval: project });
    },

    cancelRemoveProject: () => {
      if (get().isRemovingProject) return;
      set({ projectPendingRemoval: null });
    },

    confirmRemoveProject: async () => {
      const pending = get().projectPendingRemoval;
      if (!pending || get().isRemovingProject) return;

      const path = pending.path;
      set({ isRemovingProject: true });

      try {
        await deleteProjectCache(path);

        const settings = applyRemovedProject(get().settings, path);
        saveSettings(settings);
        const projects = sortProjectsByRecent(getSavedProjects(settings));
        const nextPath = getActiveProjectPath(settings) ?? null;
        const wasActive = get().projectPath === path;

        set({ settings, projects });

        if (wasActive) {
          await stopProjectWatch();

          if (nextPath) {
            set({
              projectPath: nextPath,
              projectName:
                projects.find((p) => p.path === nextPath)?.name ?? projectFolderName(nextPath),
              scanResult: null,
              routerResult: null,
              easData: null,
              easError: null,
              credentials: null,
              bundle: null,
              healthHistory: loadHealthHistory(nextPath),
              bundleHistory: loadBundleHistory(nextPath),
            });
            await get().hydrateProject(nextPath);
          } else {
            // Hangar is back to its empty state - treat the next first-add
            // as a genuine first-run and re-arm the onboarding tour. Without
            // this, leftover localStorage from a previous session permanently
            // silences the tour for users who remove all their projects.
            resetTour();
            set({
              projectPath: null,
              projectName: null,
              scanResult: null,
              routerResult: null,
              easData: null,
              credentials: null,
              bundle: null,
              healthHistory: [],
              bundleHistory: [],
              activeScreen: "dashboard",
              tourCompleted: false,
            });
          }
        }
      } finally {
        set({ isRemovingProject: false, projectPendingRemoval: null });
      }
    },
  };
}
