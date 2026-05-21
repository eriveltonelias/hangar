export type IssueSeverity = "critical" | "warning" | "info" | "passed";

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: string;
  title: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestedFix?: string;
  docsUrl?: string;
}

export interface Check {
  id: string;
  name: string;
  passed: boolean;
  severity: IssueSeverity;
}

export interface ScanMetadata {
  scannedAt: string;
  packageManager?: "npm" | "yarn" | "pnpm" | "bun" | "unknown";
  hasEasJson: boolean;
  hasAppConfig: boolean;
  expoRouterEnabled: boolean;
  easBuildConfigured: boolean;
}

export interface ScanResult {
  projectName: string;
  projectPath: string;
  detectedFramework: "expo" | "react-native" | "unknown";
  sdkVersion?: string;
  healthScore: number;
  issues: Issue[];
  checks: Check[];
  metadata: ScanMetadata;
}

export interface ExpoDoctorCheck {
  id: string;
  title: string;
  passed: boolean;
  details?: string;
  advice?: string;
}

export interface ExpoDoctorResult {
  status: "success" | "failed" | "error";
  passed: number;
  total: number;
  checks: ExpoDoctorCheck[];
  error?: string;
  ranAt: string;
}

export interface ExpoConfigResult {
  status: "success" | "failed" | "error";
  ranAt: string;
  slug?: string;
  error?: string;
}

export type BuildVerificationStatus = "pass" | "fail" | "warn" | "skip";

export interface BuildVerificationCheck {
  id: string;
  label: string;
  status: BuildVerificationStatus;
  description?: string;
}

export interface BuildVerificationResult {
  ranAt: string;
  checks: BuildVerificationCheck[];
  canBuild: boolean;
  hasWarnings: boolean;
}

export interface FileSystemAdapter {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  readDir(path: string): Promise<string[]>;
  isDirectory?(path: string): Promise<boolean>;
  readDirRecursive?(path: string): Promise<string[]>;
}

export interface BuildRecord {
  id: string;
  platform: "ios" | "android" | "all";
  profile: string;
  branch: string;
  commit: string;
  duration: string;
  status: "finished" | "errored" | "in-progress" | "in-queue" | "canceled";
  startedAt: string;
  runtimeVersion?: string;
  log?: string;
}

export interface BuildIssueExplanation {
  rootCause: string;
  suggestedFix: string;
  affectedFiles: string[];
  nextActions: string[];
}

export interface UpdateRecord {
  id: string;
  message: string;
  runtimeVersion: string;
  channel: string;
  branch: string;
  platform: "ios" | "android" | "all";
  publishedAt: string;
  groupId?: string;
}

export interface UpdateCompatibility {
  status: "compatible" | "not-compatible" | "unknown";
  runtimeVersionMatch: boolean;
  channelMatch: boolean;
  branchMatch: boolean;
  platformMatch: boolean;
  rolloutStatus: "active" | "rolled-back" | "unknown";
}

export interface RouteNode {
  id: string;
  name: string;
  path: string;
  filePath: string;
  type: "layout" | "page" | "group" | "dynamic" | "not-found" | "modal";
  children: RouteNode[];
  dynamicParams?: string[];
  deepLinkPattern?: string;
  warnings: Issue[];
  isProtected?: boolean;
}

export interface RouterScanResult {
  projectPath: string;
  appDirectory: string;
  routes: RouteNode[];
  routeGroups: string[];
  warnings: Issue[];
  hasNotFound: boolean;
  urlScheme?: string;
}

export interface EnvironmentMapping {
  profile: string;
  channel: string;
  branch: string;
  envFile?: string;
  apiUrl?: string;
  runtimeVersion?: string;
  warnings: Issue[];
}

export type CredentialsHealthStatus = "expired" | "critical" | "warning" | "ok" | "unknown";

export interface MobileProvisionInfo {
  filePath: string;
  name?: string;
  uuid?: string;
  teamName?: string;
  appIdName?: string;
  /** ISO 8601 expiration date string from the embedded plist. */
  expiresAt?: string;
  creationDate?: string;
  /** Computed in TS from expiresAt. */
  daysUntilExpiry?: number;
  /** Computed in TS from daysUntilExpiry. */
  expirationStatus: CredentialsHealthStatus;
}

export interface CredentialsJsonInfo {
  filePath: string;
  raw: unknown;
}

export interface CredentialsScanRaw {
  /** Anchor for "scanned at" - set by the scanner. */
  scannedAt: string;
  hasCredentialsJson: boolean;
  credentialsJson: CredentialsJsonInfo | null;
  provisioningProfiles: MobileProvisionInfo[];
  keystores: string[];
  iosCertificates: string[];
}

export interface CredentialsReport extends CredentialsScanRaw {
  /** Worst expirationStatus across all profiles; "unknown" if nothing dated. */
  worstStatus: CredentialsHealthStatus;
  /** True when no local credentials were found - EAS-managed is the default. */
  managedByEas: boolean;
}

export type BundleCategory = "javascript" | "images" | "fonts" | "media" | "data" | "other";

export interface BundleFile {
  path: string;
  /** Path relative to the bundle root, for display. */
  relativePath: string;
  bytes: number;
  category: BundleCategory;
}

export interface BundleCategoryStat {
  category: BundleCategory;
  bytes: number;
  fileCount: number;
  /** 0..1 share of the total. */
  share: number;
}

export interface BundleSizeReport {
  /** Directory the scanner read (dist/ or .expo/bundle-output/). */
  bundleDir: string;
  /** ISO timestamp set by the TS layer when the scan completed. */
  scannedAt: string;
  totalBytes: number;
  fileCount: number;
  byCategory: BundleCategoryStat[];
  /** Up to N largest files, sorted desc. */
  topFiles: BundleFile[];
}

export interface BundleSizeRaw {
  bundleDir: string;
  totalBytes: number;
  fileCount: number;
  files: BundleFile[];
}

export interface BundleSizeSnapshot {
  /** ISO timestamp. */
  date: string;
  totalBytes: number;
  fileCount: number;
}

export interface BundleSizeDelta {
  previousBytes: number;
  currentBytes: number;
  absoluteDelta: number;
  /** Signed percent change. +0.12 = +12%. */
  percentDelta: number;
  severity: "ok" | "watch" | "warning" | "critical";
}

export interface ReleaseChecklistItem {
  id: string;
  label: string;
  status: "done" | "pending" | "warning" | "na";
  description?: string;
}

export interface ReleaseReadiness {
  score: number;
  version: string;
  buildNumber: string;
  profile: string;
  environment: string;
  channel: string;
  commit: string;
  checklist: ReleaseChecklistItem[];
}

export type DeployStore = "ios" | "android";

export type DeployRequirementStatus = "pass" | "fail" | "warn";

export interface DeployRequirement {
  id: string;
  label: string;
  status: DeployRequirementStatus;
  description?: string;
}

export interface DeployReadiness {
  store: DeployStore;
  profile: string;
  requirements: DeployRequirement[];
  canDeploy: boolean;
  hasWarnings: boolean;
  command: string;
}

export interface SavedProject {
  path: string;
  name: string;
  addedAt: string;
  lastOpenedAt?: string;
}

export interface AppSettings {
  /** @deprecated Use projects + activeProjectPath */
  projectPath?: string;
  projects?: SavedProject[];
  activeProjectPath?: string;
  easCliPath?: string;
  preferredEditor: "vscode" | "cursor" | "none";
  scanFrequency: "manual" | "on-open" | "hourly";
  theme: "dark" | "light" | "system";
}
