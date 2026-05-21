import type {
  BuildRecord,
  UpdateRecord,
  UpdateCompatibility,
  EnvironmentMapping,
  ReleaseReadiness,
  ReleaseChecklistItem,
  ScanResult,
  Issue,
} from "../types/index.js";
import { detectStagingUrl, createIssue } from "../utils/helpers.js";

// --- EAS raw types (CLI JSON output) ---

export interface EasBuildRaw {
  id: string;
  status: string;
  platform: string;
  buildProfile?: string;
  channel?: string;
  gitCommitHash?: string;
  gitCommitMessage?: string;
  createdAt?: string;
  completedAt?: string;
  appVersion?: string;
  appBuildVersion?: string;
  runtimeVersion?: string;
  error?: { message?: string; errorCode?: string };
  artifacts?: { buildUrl?: string };
  metadata?: { buildProfile?: string; channel?: string };
}

export interface EasUpdateRaw {
  id?: string;
  message?: string;
  runtimeVersion?: string;
  platform?: string;
  platforms?: string;
  branch?: string;
  group?: string;
  createdAt?: string;
  channel?: string;
}

export interface EasChannelRaw {
  id?: string;
  name: string;
  branchName?: string;
  branch?: { name?: string };
}

export interface EasBranchRaw {
  id?: string;
  name: string;
  updateBranch?: { name?: string };
}

export interface EasProjectInfoRaw {
  id?: string;
  slug?: string;
  fullName?: string;
  ownerAccount?: { name?: string };
}

export interface EasBuildViewRaw {
  id?: string;
  status?: string;
  platform?: string;
  logs?: string;
  error?: { message?: string; errorCode?: string };
  message?: string;
  buildProfile?: string;
  channel?: string;
  appVersion?: string;
  appBuildVersion?: string;
  runtimeVersion?: string;
  gitCommitHash?: string;
  gitCommitMessage?: string;
  createdAt?: string;
  completedAt?: string;
  distribution?: string;
  artifacts?: { buildUrl?: string };
  logFiles?: string[];
}

export interface EasJsonProfile {
  extends?: string;
  channel?: string;
  env?: Record<string, string>;
  distribution?: string;
}

export interface EasJsonConfig {
  build?: Record<string, EasJsonProfile>;
  submit?: Record<string, { ios?: Record<string, unknown>; android?: Record<string, unknown> }>;
}

// --- Parsers ---

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
}

function extractJsonSlice(text: string): string | null {
  const cleaned = stripAnsi(stripEasCliNoise(text));
  const start = cleaned.search(/[\[{]/);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }

  return null;
}

function parseJsonOutput<T>(output: string): T {
  const trimmed = stripEasCliNoise(output);
  if (!trimmed) throw new Error("EAS CLI returned empty output");
  try {
    return JSON.parse(stripAnsi(trimmed)) as T;
  } catch {
    const slice = extractJsonSlice(output);
    if (slice) {
      return JSON.parse(slice) as T;
    }
    throw new Error("Failed to parse EAS CLI JSON output");
  }
}

function stripEasCliNoise(output: string): string {
  return output
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith("★") &&
        !trimmed.includes("eas-cli@") &&
        !trimmed.includes("Proceeding with outdated") &&
        trimmed !== "To upgrade, run:" &&
        trimmed !== "npm install -g eas-cli"
      );
    })
    .join("\n")
    .trim();
}

function unwrapArray<T>(parsed: unknown, ...keys: string[]): T[] {
  if (Array.isArray(parsed)) return parsed as T[];
  if (parsed && typeof parsed === "object") {
    for (const key of keys) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

export function parseEasJson<T>(output: string): T {
  return parseJsonOutput<T>(output);
}

function resolveBuildStatus(raw: EasBuildRaw): BuildRecord["status"] {
  const normalized = raw.status.toLowerCase().replace(/_/g, "-");

  if (raw.error?.message && (raw.completedAt || normalized === "errored")) {
    return "errored";
  }

  if (raw.completedAt) {
    if (normalized === "canceled" || normalized === "cancelled") return "canceled";
    if (normalized === "errored") return "errored";
    return "finished";
  }

  if (normalized === "finished") return "finished";
  if (normalized === "errored" || normalized === "error") return "errored";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";
  if (normalized === "in-progress" || normalized === "pending-cancel") return "in-progress";
  if (normalized === "in-queue" || normalized === "new" || normalized === "pending") {
    return "in-queue";
  }

  return "in-queue";
}

function formatDuration(start?: string, end?: string): string {
  if (!start || !end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0 || Number.isNaN(ms)) return "-";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function shortCommit(hash?: string): string {
  if (!hash) return "-";
  return hash.slice(0, 7);
}

export function parseEasBuilds(output: string): BuildRecord[] {
  const raw = unwrapArray<EasBuildRaw>(parseJsonOutput<unknown>(output), "builds", "currentPage");
  if (raw.length === 0) return [];

  return raw.map((b) => ({
    id: b.id,
    platform: normalizePlatform(b.platform),
    profile: b.buildProfile ?? b.metadata?.buildProfile ?? "unknown",
    branch: b.channel ?? b.metadata?.channel ?? "-",
    commit: shortCommit(b.gitCommitHash),
    duration: formatDuration(b.createdAt, b.completedAt),
    status: resolveBuildStatus(b),
    startedAt: b.createdAt ?? new Date().toISOString(),
    runtimeVersion: b.runtimeVersion,
    log: b.error?.message,
  }));
}

function parseUpdatePublishedAt(message?: string, createdAt?: string): string {
  if (createdAt) return createdAt;
  if (!message) return new Date().toISOString();

  if (/\(just now by/i.test(message)) {
    return new Date().toISOString();
  }

  const match = message.match(
    /\((\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i,
  );
  if (!match) return new Date().toISOString();

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const unitMs: Record<string, number> = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };

  return new Date(Date.now() - amount * (unitMs[unit] ?? unitMs.day)).toISOString();
}

export function parseEasUpdates(output: string): UpdateRecord[] {
  const raw = unwrapArray<EasUpdateRaw>(parseJsonOutput<unknown>(output), "updates", "currentPage");
  if (raw.length === 0) return [];

  const updates = raw.map((u, index) => ({
    id: u.id ?? u.group ?? `${u.branch ?? "update"}-${index}`,
    message: cleanUpdateMessage(u.message),
    runtimeVersion: u.runtimeVersion ?? "unknown",
    channel: u.channel ?? u.branch ?? "-",
    branch: u.branch ?? "-",
    platform: normalizeUpdatePlatform(u.platform, u.platforms),
    publishedAt: parseUpdatePublishedAt(u.message, u.createdAt),
    groupId: u.group,
  }));

  return updates.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

function cleanUpdateMessage(message?: string): string {
  if (!message) return "Update";

  let cleaned = message
    .replace(/\s*\(just now by [^)]+\)$/i, "")
    .replace(/\s*\(\d+\s+\w+\s+ago by [^)]+\)$/i, "")
    .trim();

  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned.replace(/^"+|"+$/g, "").trim() || "Update";
}

function normalizeUpdatePlatform(platform?: string, platforms?: string): BuildRecord["platform"] {
  if (platform) return normalizePlatform(platform);
  if (!platforms) return "all";
  const parts = platforms.split(",").map((p) => p.trim().toLowerCase());
  if (parts.includes("ios") && parts.includes("android")) return "all";
  if (parts.length === 1) return normalizePlatform(parts[0]);
  return "all";
}

export function parseEasChannels(output: string): EasChannelRaw[] {
  return unwrapArray<EasChannelRaw>(parseJsonOutput<unknown>(output), "channels", "currentPage");
}

export function parseEasBranches(output: string): EasBranchRaw[] {
  return unwrapArray<EasBranchRaw>(parseJsonOutput<unknown>(output), "branches", "currentPage");
}

function parseEasProjectInfoText(output: string): EasProjectInfoRaw | null {
  const text = output.trim();
  if (!text) return null;

  const fullNameMatch = text.match(/fullName\s+(@[\w-]+\/[\w-]+)/i);
  const idMatch = text.match(/\bID\s+([a-f0-9-]{36})/i);
  const slugMatch = text.match(/\bslug\s+(\S+)/i);

  const fullName = fullNameMatch?.[1];
  const id = idMatch?.[1];
  if (!fullName && !id) return null;

  const slug = slugMatch?.[1] ?? fullName?.split("/").pop();
  const ownerMatch = fullName?.match(/^@?([^/]+)\//);

  return {
    id,
    slug,
    fullName,
    ownerAccount: ownerMatch ? { name: ownerMatch[1] } : undefined,
  };
}

export function parseEasProjectInfo(output: string): EasProjectInfoRaw | null {
  try {
    return parseJsonOutput<EasProjectInfoRaw>(output);
  } catch {
    return parseEasProjectInfoText(output);
  }
}

function formatBuildViewSummary(raw: EasBuildViewRaw): string {
  const lines: string[] = [];
  const status = raw.status?.toLowerCase() ?? "unknown";

  if (status === "finished") {
    lines.push("Build completed successfully.");
  } else if (status === "errored") {
    lines.push("Build failed.");
  } else {
    lines.push(`Build status: ${raw.status ?? "unknown"}`);
  }

  lines.push("");
  if (raw.platform) lines.push(`Platform:  ${raw.platform}`);
  if (raw.buildProfile) lines.push(`Profile:   ${raw.buildProfile}`);
  if (raw.channel) lines.push(`Channel:   ${raw.channel}`);
  if (raw.distribution) lines.push(`Distribution: ${raw.distribution}`);
  if (raw.appVersion) {
    const buildNum = raw.appBuildVersion ? ` (${raw.appBuildVersion})` : "";
    lines.push(`Version:   ${raw.appVersion}${buildNum}`);
  }
  if (raw.gitCommitHash) {
    const msg = raw.gitCommitMessage ? ` - ${raw.gitCommitMessage}` : "";
    lines.push(`Commit:    ${raw.gitCommitHash.slice(0, 7)}${msg}`);
  }
  if (raw.createdAt && raw.completedAt) {
    lines.push(`Duration:  ${formatDuration(raw.createdAt, raw.completedAt)}`);
  }
  if (raw.artifacts?.buildUrl) {
    lines.push("");
    lines.push(`Artifact:  ${raw.artifacts.buildUrl}`);
  }
  if (raw.logFiles?.length) {
    lines.push("");
    lines.push("Full build logs on EAS:");
    for (const url of raw.logFiles.slice(0, 2)) {
      lines.push(`  ${url.split("?")[0]}`);
    }
  }

  return lines.join("\n");
}

export function parseBuildViewLog(output: string): string {
  try {
    const raw = parseJsonOutput<EasBuildViewRaw>(output);
    if (raw.logs) return raw.logs;
    if (raw.error?.message) return raw.error.message;
    if (raw.message) return raw.message;
    if (raw.id || raw.status) return formatBuildViewSummary(raw);
  } catch {
    /* fall through to raw text */
  }

  const trimmed = output.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const raw = JSON.parse(trimmed) as EasBuildViewRaw;
      if (raw.logs) return raw.logs;
      if (raw.error?.message) return raw.error.message;
      if (raw.id || raw.status) return formatBuildViewSummary(raw);
    } catch {
      /* ignore malformed JSON */
    }
  }

  return trimmed || "No log output available.";
}

function normalizePlatform(p: string): BuildRecord["platform"] {
  const lower = p.toLowerCase();
  if (lower === "ios") return "ios";
  if (lower === "android") return "android";
  return "all";
}

// --- Compatibility ---

export interface UpdateInspectorData {
  compatibility: UpdateCompatibility;
  productionBuild?: BuildRecord;
  latestUpdate?: UpdateRecord;
  runtimeVersion?: string;
  channel?: string;
  branch?: string;
  lastPublished?: string;
}

export function computeUpdateCompatibility(
  builds: BuildRecord[],
  updates: UpdateRecord[],
  channel = "production",
): UpdateInspectorData {
  const env = channel.toLowerCase();
  const productionBuilds = builds.filter(
    (b) => b.profile.toLowerCase() === env || b.branch.toLowerCase() === env,
  );
  const productionBuild = productionBuilds.find((b) => b.status === "finished");
  const channelUpdates = updates.filter(
    (u) => u.channel.toLowerCase() === env || u.branch.toLowerCase() === env,
  );
  const latestUpdate = channelUpdates[0];

  if (!productionBuild && !latestUpdate) {
    return {
      compatibility: {
        status: "unknown",
        runtimeVersionMatch: false,
        channelMatch: false,
        branchMatch: false,
        platformMatch: false,
        rolloutStatus: "unknown",
      },
    };
  }

  if (!productionBuild || !latestUpdate) {
    return {
      compatibility: {
        status: "unknown",
        runtimeVersionMatch: false,
        channelMatch: Boolean(latestUpdate),
        branchMatch: Boolean(latestUpdate?.branch && latestUpdate.branch !== "-"),
        platformMatch: Boolean(latestUpdate),
        rolloutStatus: "unknown",
      },
      productionBuild,
      latestUpdate,
      runtimeVersion: latestUpdate?.runtimeVersion ?? productionBuild?.runtimeVersion,
      channel: latestUpdate?.channel ?? env,
      branch: latestUpdate?.branch,
      lastPublished: latestUpdate?.publishedAt,
    };
  }

  const buildRuntime = productionBuild.runtimeVersion;
  const runtimeVersionMatch =
    Boolean(buildRuntime && latestUpdate.runtimeVersion !== "unknown") &&
    buildRuntime === latestUpdate.runtimeVersion;

  const channelMatch =
    latestUpdate.channel.toLowerCase() === env || latestUpdate.branch.toLowerCase() === env;
  const branchMatch = latestUpdate.branch !== "-";
  const platformMatch =
    latestUpdate.platform === "all" || latestUpdate.platform === productionBuild.platform;

  const compatible = channelMatch && branchMatch && runtimeVersionMatch;

  return {
    compatibility: {
      status: compatible ? "compatible" : "not-compatible",
      runtimeVersionMatch,
      channelMatch,
      branchMatch,
      platformMatch,
      rolloutStatus: "active",
    },
    productionBuild,
    latestUpdate,
    runtimeVersion: latestUpdate.runtimeVersion,
    channel: latestUpdate.channel !== "-" ? latestUpdate.channel : latestUpdate.branch,
    branch: latestUpdate.branch,
    lastPublished: latestUpdate.publishedAt,
  };
}

// --- Environments ---

export function buildEnvironmentMappings(
  easJson: EasJsonConfig | null,
  channels: EasChannelRaw[],
  branches: EasBranchRaw[],
  envFileContents: Record<string, string>,
): EnvironmentMapping[] {
  if (!easJson?.build) return [];

  const channelByName = new Map(channels.map((c) => [c.name, c]));
  const branchNames = new Set(branches.map((b) => b.name));

  return Object.entries(easJson.build).map(([profile, config]) => {
    const channelName = config.channel ?? profile;
    const channel = channelByName.get(channelName);
    const branch =
      channel?.branchName ??
      channel?.branch?.name ??
      (branchNames.has(profile) ? profile : "main");

    const envFile = guessEnvFile(profile);
    const envContent = envFile ? envFileContents[envFile] : undefined;
    const apiUrl = envContent ? extractApiUrl(envContent) : config.env?.EXPO_PUBLIC_API_URL;
    const warnings: Issue[] = [];

    if (profile === "production" && envContent && detectStagingUrl(envContent)) {
      warnings.push(
        createIssue({
          severity: "critical",
          category: "Environment",
          title: "Production profile uses staging/dev URLs",
          description: `${envFile ?? "env file"} contains localhost, staging, or dev API URLs.`,
          filePath: envFile,
          suggestedFix: "Use production API URLs in the production build profile env file.",
        }),
      );
    }

    return {
      profile,
      channel: channelName,
      branch,
      envFile,
      apiUrl,
      runtimeVersion: config.env?.EXPO_PUBLIC_RUNTIME_VERSION,
      warnings,
    };
  });
}

function guessEnvFile(profile: string): string | undefined {
  switch (profile) {
    case "production":
      return ".env.production";
    case "preview":
    case "staging":
      return ".env.staging";
    case "development":
      return ".env";
    default:
      return `.env.${profile}`;
  }
}

function extractApiUrl(content: string): string | undefined {
  const match = content.match(/EXPO_PUBLIC_API_URL\s*=\s*['"]?([^\s'"]+)/);
  return match?.[1];
}

// --- Release readiness ---

export function buildReleaseReadiness(
  scanResult: ScanResult | null,
  builds: BuildRecord[],
  updates: UpdateRecord[],
  environment: string,
): ReleaseReadiness {
  const productionBuilds = builds.filter((b) => b.profile === "production");
  const latestProd = productionBuilds.find((b) => b.status === "finished");
  const issues = scanResult?.issues ?? [];

  const checklist = buildReleaseChecklist(issues, updates, productionBuilds);
  const doneCount = checklist.filter((c) => c.status === "done").length;
  const score = Math.round((doneCount / checklist.length) * 100);

  return {
    score,
    version: scanResult?.sdkVersion ?? "-",
    buildNumber: latestProd?.id.slice(0, 8) ?? "-",
    profile: "production",
    environment,
    channel: "production",
    commit: latestProd?.commit ?? "-",
    checklist,
  };
}

// Fix typo - scanResult doesn't have nested scanResult
function buildReleaseChecklist(
  issues: Issue[],
  updates: UpdateRecord[],
  productionBuilds: BuildRecord[],
): ReleaseChecklistItem[] {
  const hasIssue = (keyword: string) =>
    issues.some(
      (i) =>
        i.severity !== "passed" &&
        (i.title.toLowerCase().includes(keyword) || i.category.toLowerCase().includes(keyword)),
    );
  const passedCheck = (keyword: string) =>
    issues.some(
      (i) => i.severity === "passed" && i.title.toLowerCase().includes(keyword),
    );

  return [
    {
      id: "icon",
      label: "App icon",
      status: hasIssue("icon") ? "pending" : passedCheck("icon") ? "done" : "warning",
    },
    {
      id: "splash",
      label: "Splash screen",
      status: hasIssue("splash") ? "pending" : passedCheck("splash") ? "done" : "warning",
    },
    {
      id: "build-number",
      label: "Production build available",
      status: productionBuilds.some((b) => b.status === "finished") ? "done" : "pending",
      description: productionBuilds.length === 0 ? "No finished production builds found" : undefined,
    },
    {
      id: "permissions",
      label: "Permissions usage descriptions",
      status: hasIssue("permission") ? "pending" : "done",
    },
    {
      id: "privacy",
      label: "Privacy manifest",
      status: "pending",
      description: "Verify iOS PrivacyInfo.xcprivacy before App Store submission",
    },
    {
      id: "android-perms",
      label: "Android permissions policy",
      status: hasIssue("android") ? "warning" : "done",
    },
    {
      id: "update-compat",
      label: "Update compatibility",
      status: updates.length > 0 ? "done" : "warning",
      description: updates.length === 0 ? "No EAS updates published yet" : undefined,
    },
    {
      id: "changelog",
      label: "Changelog / What's New",
      status: "pending",
      description: "Prepare store release notes before submission",
    },
    {
      id: "screenshots",
      label: "Store screenshots",
      status: "pending",
      description: "Add App Store / Play Store screenshots",
    },
    {
      id: "credentials",
      label: "Store credentials",
      status: "na",
      description: "Configure in EAS Submit",
    },
  ];
}

export interface StoreRelease {
  id: string;
  version: string;
  platform: "ios" | "android";
  status: string;
  date: string;
}

export function deriveStoreReleases(builds: BuildRecord[]): StoreRelease[] {
  return builds
    .filter((b) => b.profile === "production" && b.status === "finished")
    .slice(0, 10)
    .map((b) => ({
      id: b.id,
      version: b.profile,
      platform: b.platform === "all" ? "ios" : b.platform,
      status: "finished",
      date: b.startedAt.slice(0, 10),
    }));
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
