import type {
  ScanResult,
  RouterScanResult,
  AppSettings,
  SavedProject,
  ExpoDoctorResult,
  ExpoConfigResult,
  BuildVerificationResult,
  CredentialsReport,
  BundleSizeReport,
  BundleSizeSnapshot,
} from "@expopilot/core";
import type { EasData } from "../eas-service";
import type { EasAuthStatus } from "../eas-auth";
import type { HealthHistoryEntry } from "../services";

export interface UiSlice {
  activeScreen: string;
  setActiveScreen: (screen: string) => void;
}

export type ToastVariant = "info" | "success" | "warning" | "error" | "loading";

export interface ToastAction {
  label: string;
  /** Slash-prefixed screen id (e.g. "/builds") to navigate to, or a function. */
  onClick: string | (() => void | Promise<void>);
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
  action?: ToastAction;
  createdAt: number;
}

export interface ToastInput {
  id?: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
  action?: ToastAction;
}

export interface ToastsSlice {
  toasts: Toast[];
  pushToast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

export interface OnboardingSlice {
  tourActive: boolean;
  tourStepIndex: number;
  tourCompleted: boolean;
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  dismissTour: () => void;
  replayTour: () => void;
}

export interface ProjectsSlice {
  settings: AppSettings;
  projects: SavedProject[];
  projectPath: string | null;
  projectName: string | null;
  isSelectingProject: boolean;
  projectPendingRemoval: SavedProject | null;
  isRemovingProject: boolean;

  setSettings: (settings: AppSettings) => void;
  addProject: () => Promise<void>;
  switchProject: (path: string) => Promise<void>;
  requestRemoveProject: (path: string) => void;
  cancelRemoveProject: () => void;
  confirmRemoveProject: () => Promise<void>;
}

export interface ScanSlice {
  scanResult: ScanResult | null;
  routerResult: RouterScanResult | null;
  expoDoctor: ExpoDoctorResult | null;
  expoConfig: ExpoConfigResult | null;
  buildVerification: BuildVerificationResult | null;
  credentials: CredentialsReport | null;
  bundle: BundleSizeReport | null;
  bundleHistory: BundleSizeSnapshot[];
  healthHistory: HealthHistoryEntry[];
  isScanning: boolean;
  isBackgroundRefreshing: boolean;
  isRunningExpoDoctor: boolean;
  isVerifyingBuild: boolean;
  isScanningCredentials: boolean;
  isScanningBundle: boolean;
  isExportingBundle: boolean;
  scanError: string | null;

  setScanError: (msg: string | null) => void;
  scanAndCacheProject: (path: string, options?: { blocking?: boolean }) => Promise<void>;
  hydrateProject: (path: string) => Promise<void>;
  refreshProjectFromWatch: (path: string) => Promise<void>;
  scanProject: () => Promise<void>;
  verifyBeforeBuild: () => Promise<void>;
  runExpoDoctorCheck: () => Promise<void>;
  scanRouter: () => Promise<void>;
  scanCredentials: () => Promise<void>;
  scanBundle: () => Promise<void>;
  runExpoExport: () => Promise<void>;
}

export interface EasSlice {
  environment: string;
  easData: EasData | null;
  easAuth: EasAuthStatus | null;
  isLoadingEas: boolean;
  isRefreshingBuilds: boolean;
  isCheckingEasAuth: boolean;
  /** True while a Deploy (build+submit) is in flight. Used to block concurrent deploys. */
  isDeploying: boolean;
  easError: string | null;

  setEnvironment: (env: string) => void;
  setEasError: (msg: string | null) => void;
  setIsDeploying: (deploying: boolean) => void;
  checkEasAuth: () => Promise<EasAuthStatus>;
  loadEasData: (options?: { background?: boolean }) => Promise<void>;
  refreshBuilds: () => Promise<void>;
  refreshUpdatesAfterPublish: () => Promise<void>;
  refreshBuildsAfterDeploy: () => Promise<void>;
}

export type AppState = UiSlice &
  ProjectsSlice &
  ScanSlice &
  EasSlice &
  ToastsSlice &
  OnboardingSlice;

export type SetState = (
  partial:
    | Partial<AppState>
    | ((state: AppState) => Partial<AppState>),
) => void;

export type GetState = () => AppState;
