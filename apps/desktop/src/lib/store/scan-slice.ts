import {
  runProjectScan,
  runRouterScan,
  appendHealthHistory,
  loadHealthHistory,
  getSavedProjects,
  checkGitStatus,
} from "../services";
import { evaluateBuildVerification, type ExpoDoctorResult } from "@hangar/core";
import { scanCredentials as runCredentialsScan } from "../credentials-service";
import { scanBundle as runBundleScan, loadBundleHistory, appendBundleHistory } from "../bundle-service";
import { runProjectCommand } from "../services";
import { sortProjectsByRecent, projectFolderName } from "../projects";
import { isTauri } from "../platform";
import { formatError } from "../errors";
import { runExpoDoctor } from "../expo-doctor-service";
import { runExpoConfigCheck } from "../expo-config-service";
import {
  loadProjectCache,
  loadEasCache,
} from "../project-cache";
import { startProjectWatch } from "../project-watch";
import type { GetState, ScanSlice, SetState } from "./types";
import {
  persistActiveProject,
  persistProjectSnapshot,
  recomputeEasDerived,
  type InitialState,
} from "./helpers";

export function createScanSlice(
  set: SetState,
  get: GetState,
  init: InitialState,
): ScanSlice {
  return {
    scanResult: null,
    routerResult: null,
    expoDoctor: null,
    expoConfig: null,
    buildVerification: null,
    credentials: null,
    bundle: null,
    bundleHistory: loadBundleHistory(init.projectPath ?? undefined),
    healthHistory: loadHealthHistory(init.projectPath ?? undefined),
    isScanning: false,
    isBackgroundRefreshing: false,
    isRunningExpoDoctor: false,
    isVerifyingBuild: false,
    isScanningCredentials: false,
    isScanningBundle: false,
    isExportingBundle: false,
    scanError: null,

    setScanError: (scanError) => set({ scanError }),

    scanCredentials: async () => {
      const { projectPath } = get();
      if (!projectPath || get().isScanningCredentials) return;

      set({ isScanningCredentials: true });
      try {
        const credentials = await runCredentialsScan(projectPath);
        if (get().projectPath === projectPath) {
          set({ credentials });
        }
      } catch (err) {
        if (get().projectPath === projectPath) {
          set({ scanError: formatError(err) || "Credentials scan failed" });
        }
      } finally {
        set({ isScanningCredentials: false });
      }
    },

    scanBundle: async () => {
      const { projectPath } = get();
      if (!projectPath || get().isScanningBundle) return;

      set({ isScanningBundle: true });
      try {
        const bundle = await runBundleScan(projectPath);
        if (get().projectPath !== projectPath) return;

        if (!bundle) {
          set({ bundle: null });
          return;
        }

        const history = appendBundleHistory(projectPath, {
          date: bundle.scannedAt,
          totalBytes: bundle.totalBytes,
          fileCount: bundle.fileCount,
        });
        set({ bundle, bundleHistory: history });
      } catch (err) {
        if (get().projectPath === projectPath) {
          set({ scanError: formatError(err) || "Bundle scan failed" });
        }
      } finally {
        set({ isScanningBundle: false });
      }
    },

    runExpoExport: async () => {
      const { projectPath } = get();
      if (!projectPath || !isTauri() || get().isExportingBundle) return;

      set({ isExportingBundle: true });
      try {
        // Default expo export output dir is `dist/`. We pass --clear to make
        // the resulting size comparable across runs.
        await runProjectCommand(projectPath, "npx", ["expo", "export", "--clear"]);
        await get().scanBundle();
      } catch (err) {
        if (get().projectPath === projectPath) {
          set({ scanError: formatError(err) || "expo export failed" });
        }
      } finally {
        set({ isExportingBundle: false });
      }
    },

    scanAndCacheProject: async (path, options) => {
      const blocking = options?.blocking ?? true;
      if (get().isScanning || get().isBackgroundRefreshing) return;

      if (blocking) {
        set({
          isScanning: true,
          isRunningExpoDoctor: isTauri(),
          scanError: null,
          expoDoctor: null,
        });
      } else {
        set({ isBackgroundRefreshing: true, scanError: null });
      }

      try {
        if (blocking && isTauri()) {
          await get().checkEasAuth();
        }

        const doctorPromise =
          blocking && isTauri()
            ? runExpoDoctor(path).then((result) => {
                set({ expoDoctor: result, isRunningExpoDoctor: false });
                return result;
              })
            : Promise.resolve(get().expoDoctor);

        const [scanResult, routerResult] = await Promise.all([
          runProjectScan(path),
          runRouterScan(path),
        ]);
        const expoDoctor = await doctorPromise;

        const settings = get().settings;
        const nextSettings = persistActiveProject(settings, path, scanResult.projectName);
        const healthHistory = appendHealthHistory(path, scanResult.healthScore);

        await persistProjectSnapshot(
          path,
          scanResult,
          routerResult,
          expoDoctor,
          get().expoConfig,
        );

        set({
          settings: nextSettings,
          projects: sortProjectsByRecent(getSavedProjects(nextSettings)),
          scanResult,
          routerResult,
          expoDoctor: expoDoctor ?? get().expoDoctor,
          projectPath: path,
          projectName: scanResult.projectName ?? projectFolderName(path),
          healthHistory,
          isScanning: false,
          isBackgroundRefreshing: false,
          isRunningExpoDoctor: false,
        });

        void get().loadEasData({ background: !blocking });
        void get().scanCredentials();
        void get().scanBundle();
      } catch (err) {
        set({
          scanError: formatError(err) || "Scan failed",
          isScanning: false,
          isBackgroundRefreshing: false,
          isRunningExpoDoctor: false,
        });
      }
    },

    hydrateProject: async (path) => {
      const { environment } = get();
      const [projectCache, easCache] = await Promise.all([
        loadProjectCache(path),
        loadEasCache(path),
      ]);

      if (projectCache) {
        set({
          scanResult: projectCache.scanResult,
          routerResult: projectCache.routerResult,
          expoDoctor: projectCache.expoDoctor,
          expoConfig: projectCache.expoConfig ?? null,
          projectName: projectCache.scanResult.projectName,
        });
      }

      if (easCache) {
        set({
          easData: recomputeEasDerived(
            easCache.easData,
            projectCache?.scanResult ?? get().scanResult,
            environment,
          ),
        });
      }

      await startProjectWatch(path, () => {
        void get().refreshProjectFromWatch(path);
      });

      if (!projectCache) {
        await get().scanAndCacheProject(path, { blocking: true });
        return;
      }

      void get().loadEasData({ background: true });
      void get().scanCredentials();
      void get().scanBundle();
    },

    refreshProjectFromWatch: async (path) => {
      if (get().projectPath !== path) return;
      if (get().isScanning || get().isBackgroundRefreshing) return;
      await get().scanAndCacheProject(path, { blocking: false });
    },

    scanProject: async () => {
      const { projectPath } = get();
      if (!projectPath || get().isScanning || get().isBackgroundRefreshing) return;
      await get().scanAndCacheProject(projectPath, { blocking: true });
    },

    verifyBeforeBuild: async () => {
      const { projectPath } = get();
      if (!projectPath || !isTauri() || get().isVerifyingBuild) return;

      set({ isVerifyingBuild: true, scanError: null, isRunningExpoDoctor: true });
      try {
        let gitClean = false;
        let gitAvailable = true;
        try {
          const gitStatus = await checkGitStatus(projectPath);
          gitClean = gitStatus.clean;
        } catch {
          gitAvailable = false;
        }

        // Each check runs independently - the whole point of verify-before-build
        // is to surface what's broken, so one failure should not hide the rest.
        const [scanSettled, routerSettled, doctorSettled, configSettled] =
          await Promise.allSettled([
            runProjectScan(projectPath),
            runRouterScan(projectPath),
            runExpoDoctor(projectPath),
            runExpoConfigCheck(projectPath),
          ]);

        const prev = get();
        const scanResult = scanSettled.status === "fulfilled" ? scanSettled.value : prev.scanResult;
        const routerResult =
          routerSettled.status === "fulfilled" ? routerSettled.value : prev.routerResult;
        const expoDoctor: ExpoDoctorResult =
          doctorSettled.status === "fulfilled"
            ? doctorSettled.value
            : {
                status: "error",
                passed: 0,
                total: 0,
                checks: [],
                error: formatError(doctorSettled.reason) || "expo-doctor failed",
                ranAt: new Date().toISOString(),
              };
        const expoConfig =
          configSettled.status === "fulfilled" ? configSettled.value : prev.expoConfig;

        const failures: string[] = [];
        if (scanSettled.status === "rejected")
          failures.push(`Project scan: ${formatError(scanSettled.reason)}`);
        if (routerSettled.status === "rejected")
          failures.push(`Router scan: ${formatError(routerSettled.reason)}`);
        if (configSettled.status === "rejected")
          failures.push(`Expo config: ${formatError(configSettled.reason)}`);

        if (!scanResult) {
          set({
            scanError: failures.join("\n") || "Project scan failed",
            isRunningExpoDoctor: false,
            isVerifyingBuild: false,
          });
          return;
        }

        const healthHistory = appendHealthHistory(projectPath, scanResult.healthScore);
        const nextSettings = persistActiveProject(get().settings, projectPath, scanResult.projectName);
        if (routerResult) {
          await persistProjectSnapshot(projectPath, scanResult, routerResult, expoDoctor, expoConfig);
        }

        const buildVerification = evaluateBuildVerification({
          scanResult,
          expoDoctor,
          expoConfig,
          gitClean,
          gitAvailable,
        });

        set({
          settings: nextSettings,
          projects: sortProjectsByRecent(getSavedProjects(nextSettings)),
          scanResult,
          routerResult,
          expoDoctor,
          expoConfig,
          buildVerification,
          healthHistory,
          projectName: scanResult.projectName ?? projectFolderName(projectPath),
          scanError: failures.length > 0 ? failures.join("\n") : null,
          isRunningExpoDoctor: false,
        });
      } catch (err) {
        set({
          scanError: formatError(err) || "Verification failed",
          isRunningExpoDoctor: false,
        });
      } finally {
        set({ isVerifyingBuild: false });
      }
    },

    runExpoDoctorCheck: async () => {
      const { projectPath } = get();
      if (!projectPath || !isTauri() || get().isRunningExpoDoctor) return;

      set({ isRunningExpoDoctor: true });
      try {
        const result = await runExpoDoctor(projectPath);
        set({ expoDoctor: result, isRunningExpoDoctor: false });

        const { scanResult, routerResult, expoConfig } = get();
        if (scanResult && routerResult) {
          await persistProjectSnapshot(projectPath, scanResult, routerResult, result, expoConfig);
        }
      } catch (err) {
        set({
          expoDoctor: {
            status: "error",
            passed: 0,
            total: 0,
            checks: [],
            error: formatError(err) || "expo-doctor failed",
            ranAt: new Date().toISOString(),
          },
          isRunningExpoDoctor: false,
        });
      }
    },

    scanRouter: async () => {
      const { projectPath, scanResult } = get();
      if (!projectPath) return;
      try {
        const routerResult = await runRouterScan(projectPath);
        set({ routerResult });
        if (scanResult) {
          await persistProjectSnapshot(projectPath, scanResult, routerResult, get().expoDoctor, get().expoConfig);
        }
      } catch (err) {
        set({
          scanError: err instanceof Error ? err.message : "Router scan failed",
        });
      }
    },
  };
}
