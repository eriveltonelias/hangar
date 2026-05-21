import { loadEasData, refreshEasUpdates, refreshEasBuilds, type EasData } from "../eas-service";
import { checkEasAuth } from "../eas-auth";
import { isTauri } from "../platform";
import { formatError } from "../errors";
import type { EasSlice, GetState, SetState } from "./types";
import { persistEasSnapshot, recomputeEasDerived } from "./helpers";

let easForegroundLoads = 0;

export function createEasSlice(set: SetState, get: GetState): EasSlice {
  // Replace the eas snapshot, recompute derived fields, and persist.
  async function applyEasPatch(
    patch: Partial<Pick<EasData, "builds" | "updates">>,
  ): Promise<EasData | null> {
    const { projectPath, easData, scanResult, environment } = get();
    if (!projectPath || !easData) return null;
    const merged: EasData = {
      ...easData,
      ...patch,
      loadedAt: new Date().toISOString(),
    };
    const next = recomputeEasDerived(merged, scanResult, environment);
    await persistEasSnapshot(projectPath, next);
    set({ easData: next, easError: next.error ?? null });
    return next;
  }

  return {
    environment: "production",
    easData: null,
    easAuth: null,
    isLoadingEas: false,
    isRefreshingBuilds: false,
    isCheckingEasAuth: false,
    isDeploying: false,
    easError: null,

    setEnvironment: (environment) => {
      const { easData, scanResult } = get();
      if (easData) {
        set({ environment, easData: recomputeEasDerived(easData, scanResult, environment) });
      } else {
        set({ environment });
      }
    },

    setEasError: (easError) => set({ easError }),

    setIsDeploying: (isDeploying) => set({ isDeploying }),

    checkEasAuth: async () => {
      if (!isTauri()) {
        const status = { state: "unavailable" as const };
        set({ easAuth: status });
        return status;
      }

      set({ isCheckingEasAuth: true });
      try {
        const easAuth = await checkEasAuth(get().settings.easCliPath);
        set({ easAuth, isCheckingEasAuth: false });
        return easAuth;
      } catch {
        const easAuth = { state: "not-logged-in" as const };
        set({ easAuth, isCheckingEasAuth: false });
        return easAuth;
      }
    },

    loadEasData: async (options) => {
      const background = options?.background ?? false;
      const { projectPath, scanResult, environment, settings } = get();
      if (!projectPath || !isTauri()) return;

      if (!background) {
        easForegroundLoads++;
        set({ isLoadingEas: true, easError: null });
      }

      try {
        const easAuth = await get().checkEasAuth();
        if (easAuth.state !== "logged-in") {
          set({ easData: null, easError: null });
          return;
        }

        const { createProjectFs } = await import("../services");
        const fs = await createProjectFs(projectPath);
        const easData = await loadEasData(
          projectPath,
          scanResult,
          environment,
          fs,
          settings.easCliPath,
        );
        await persistEasSnapshot(projectPath, easData);
        set({ easData, easError: easData.error ?? null });
      } catch (err) {
        set({ easError: formatError(err) || "Failed to load EAS data" });
      } finally {
        if (!background) {
          easForegroundLoads = Math.max(0, easForegroundLoads - 1);
          if (easForegroundLoads === 0) {
            set({ isLoadingEas: false });
          }
        }
      }
    },

    refreshBuilds: async () => {
      const { projectPath, settings, easData } = get();
      if (!projectPath || !isTauri() || get().isRefreshingBuilds) return;

      set({ isRefreshingBuilds: true, easError: null });
      try {
        const easAuth = await get().checkEasAuth();
        if (easAuth.state !== "logged-in") return;

        if (!easData) {
          await get().loadEasData({ background: false });
          return;
        }

        const builds = await refreshEasBuilds(projectPath, settings.easCliPath);
        await applyEasPatch({ builds });
      } catch (err) {
        set({ easError: formatError(err) || "Failed to refresh builds" });
      } finally {
        set({ isRefreshingBuilds: false });
      }
    },

    refreshUpdatesAfterPublish: async () => {
      const { projectPath, settings, easData } = get();
      if (!projectPath || !isTauri() || !easData) return;

      try {
        const updates = await refreshEasUpdates(projectPath, settings.easCliPath);
        await applyEasPatch({ updates });
      } catch {
        /* background refresh - ignore */
      }
    },

    refreshBuildsAfterDeploy: async () => {
      const { projectPath, settings, easData } = get();
      if (!projectPath || !isTauri() || !easData) return;

      try {
        const builds = await refreshEasBuilds(projectPath, settings.easCliPath);
        await applyEasPatch({ builds });
      } catch {
        /* background refresh - ignore */
      }
    },
  };
}
