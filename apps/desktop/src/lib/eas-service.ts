import type {
  BuildRecord,
  UpdateRecord,
  EnvironmentMapping,
  ReleaseReadiness,
  ScanResult,
  FileSystemAdapter,
} from "@hangar/core";
import {
  parseEasBuilds,
  parseEasUpdates,
  parseEasChannels,
  parseEasBranches,
  parseEasProjectInfo,
  parseBuildViewLog,
  parseEasJson,
  computeUpdateCompatibility,
  buildEnvironmentMappings,
  buildReleaseReadiness,
  deriveStoreReleases,
  joinPath,
  type EasJsonConfig,
  type UpdateInspectorData,
  type StoreRelease,
  type EasProjectInfoRaw,
} from "@hangar/core";
import {
  runEasCommand,
  runEasCommandStreaming,
  runProjectCommand,
  runProjectCommandStreaming,
} from "./services";
import { formatError } from "./errors";

export interface EasData {
  builds: BuildRecord[];
  updates: UpdateRecord[];
  environments: EnvironmentMapping[];
  compatibility: UpdateInspectorData;
  releaseReadiness: ReleaseReadiness;
  storeReleases: StoreRelease[];
  projectInfo: EasProjectInfoRaw | null;
  loadedAt: string;
  error?: string;
}

const EAS_LIST_FLAGS = ["--json", "--non-interactive"] as const;
const EAS_JSON_FLAGS = ["--json"] as const;

async function eas(
  projectPath: string,
  args: string[],
  easCliPath?: string,
  flags: readonly string[] = EAS_LIST_FLAGS,
): Promise<string> {
  const commandArgs = flags.length > 0 ? [...args, ...flags] : args;
  return runEasCommand(projectPath, commandArgs, easCliPath);
}

interface EasCommandResult {
  output: string | null;
  error: string | null;
}

async function easWithMeta(
  label: string,
  projectPath: string,
  args: string[],
  easCliPath?: string,
  optional = false,
  flags: readonly string[] = EAS_LIST_FLAGS,
): Promise<EasCommandResult> {
  try {
    return { output: await eas(projectPath, args, easCliPath, flags), error: null };
  } catch (err) {
    const raw = formatError(err);
    if (optional && isOptionalEasFailure(label, raw)) {
      return { output: null, error: null };
    }
    return { output: null, error: `${label}: ${formatEasError(raw)}` };
  }
}

function isOptionalEasFailure(label: string, message: string): boolean {
  if (label === "Updates") {
    return (
      message.includes("update:list command failed") ||
      message.includes("Branch name may not be empty") ||
      message.includes("Could not find branch") ||
      message.includes("without version control") ||
      message.includes("git rev-parse") ||
      message.includes("spawn git")
    );
  }
  if (label === "Project") {
    return message.includes("Failed to parse EAS CLI JSON output");
  }
  return false;
}

export function formatEasError(raw: string): string {
  const text = raw.trim();
  if (!text) return "EAS command failed";

  if (
    text.includes("node modules installed") ||
    text.includes("Failed to resolve plugin") ||
    text.includes("Cannot find module") ||
    text.includes("expo config")
  ) {
    return "Could not read project config. Run pnpm install (or npm install) in the project folder, then refresh.";
  }

  if (text.includes("not logged in") || text.includes("Not logged in")) {
    return "Not logged in to EAS. Run eas login in your terminal.";
  }

  if (
    text.includes("Failed to run eas") ||
    text.includes("No such file") ||
    text.includes("command not found")
  ) {
    return "EAS CLI not found. Install with npm install -g eas-cli, or set a custom EAS path in Settings.";
  }

  if (text.includes("update:list command failed") || text.includes("Branch name may not be empty")) {
    return "Could not load updates. EAS requires --branch or --all in non-interactive mode.";
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.includes("eas-cli@") &&
        !line.includes("Proceeding with outdated") &&
        !line.startsWith("★") &&
        !line.includes("without version control system is not recommended"),
    );

  if (lines.length === 0) return "EAS command failed";
  if (lines.length <= 3) return lines.join(" ");
  return lines.slice(-3).join(" ");
}

async function readEnvFiles(
  projectPath: string,
  fs: FileSystemAdapter,
  profiles: string[],
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const candidates = [".env", ".env.production", ".env.staging", ".env.preview", ".env.development"];
  for (const profile of profiles) {
    candidates.push(`.env.${profile}`);
  }

  for (const file of [...new Set(candidates)]) {
    const path = joinPath(projectPath, file);
    try {
      if (await fs.exists(path)) {
        files[file] = await fs.readFile(path);
      }
    } catch {
      /* skip unreadable env files */
    }
  }
  return files;
}

async function loadEasJson(
  projectPath: string,
  fs: FileSystemAdapter,
): Promise<EasJsonConfig | null> {
  const path = joinPath(projectPath, "eas.json");
  if (!(await fs.exists(path))) return null;
  try {
    const content = await fs.readFile(path);
    return parseEasJson<EasJsonConfig>(content);
  } catch {
    return null;
  }
}

export async function fetchBuildLog(
  projectPath: string,
  buildId: string,
  easCliPath?: string,
): Promise<string> {
  try {
    const output = await eas(projectPath, ["build:view", buildId], easCliPath, EAS_JSON_FLAGS);
    return parseBuildViewLog(output);
  } catch (err) {
    return `Failed to load build log: ${formatError(err)}`;
  }
}

export async function loadEasData(
  projectPath: string,
  scanResult: ScanResult | null,
  environment: string,
  fs: FileSystemAdapter,
  easCliPath?: string,
): Promise<EasData> {
  const [buildsResult, updatesResult, channelsResult, branchesResult, projectResult] =
    await Promise.all([
      easWithMeta("Builds", projectPath, ["build:list", "--limit", "25"], easCliPath),
      easWithMeta("Updates", projectPath, ["update:list", "--all", "--limit", "25"], easCliPath, true),
      easWithMeta("Channels", projectPath, ["channel:list"], easCliPath),
      easWithMeta("Branches", projectPath, ["branch:list"], easCliPath),
      easWithMeta("Project", projectPath, ["project:info"], easCliPath, true, []),
    ]);

  const errors = [
    buildsResult.error,
    updatesResult.error,
    channelsResult.error,
    branchesResult.error,
    projectResult.error,
  ].filter(Boolean) as string[];

  let builds: BuildRecord[] = [];
  if (buildsResult.output) {
    try {
      builds = parseEasBuilds(buildsResult.output);
    } catch (err) {
      errors.push(`Builds: ${formatEasError(formatError(err))}`);
    }
  }

  let updates: UpdateRecord[] = [];
  if (updatesResult.output) {
    try {
      updates = parseEasUpdates(updatesResult.output);
    } catch (err) {
      errors.push(`Updates: ${formatEasError(formatError(err))}`);
    }
  }

  let channels: ReturnType<typeof parseEasChannels> = [];
  if (channelsResult.output) {
    try {
      channels = parseEasChannels(channelsResult.output);
    } catch (err) {
      errors.push(`Channels: ${formatEasError(formatError(err))}`);
    }
  }

  let branches: ReturnType<typeof parseEasBranches> = [];
  if (branchesResult.output) {
    try {
      branches = parseEasBranches(branchesResult.output);
    } catch (err) {
      errors.push(`Branches: ${formatEasError(formatError(err))}`);
    }
  }

  let projectInfo: EasProjectInfoRaw | null = null;
  if (projectResult.output) {
    try {
      projectInfo = parseEasProjectInfo(projectResult.output);
    } catch (err) {
      errors.push(`Project: ${formatEasError(formatError(err))}`);
    }
  }

  const easJson = await loadEasJson(projectPath, fs);
  const envFiles = await readEnvFiles(
    projectPath,
    fs,
    easJson?.build ? Object.keys(easJson.build) : [],
  );
  const environments = buildEnvironmentMappings(easJson, channels, branches, envFiles);
  const compatibility = computeUpdateCompatibility(builds, updates, environment);
  const releaseReadiness = buildReleaseReadiness(scanResult, builds, updates, environment);
  const storeReleases = deriveStoreReleases(builds);

  return {
    builds,
    updates,
    environments,
    compatibility,
    releaseReadiness,
    storeReleases,
    projectInfo,
    loadedAt: new Date().toISOString(),
    error: errors.length > 0 ? errors.join("\n") : undefined,
  };
}

export async function refreshEasBuilds(
  projectPath: string,
  easCliPath?: string,
): Promise<BuildRecord[]> {
  const output = await eas(projectPath, ["build:list", "--limit", "25"], easCliPath);
  return parseEasBuilds(output);
}

export async function refreshEasUpdates(
  projectPath: string,
  easCliPath?: string,
): Promise<UpdateRecord[]> {
  const output = await eas(projectPath, ["update:list", "--all", "--limit", "25"], easCliPath);
  return parseEasUpdates(output);
}

export async function loadProjectEasJson(
  projectPath: string,
  fs: FileSystemAdapter,
): Promise<EasJsonConfig | null> {
  return loadEasJson(projectPath, fs);
}

/**
 * iOS-only zero-config submission via Expo's `npx testflight`. Used when the
 * user has no `submit.<profile>.ios` block in eas.json - `npx testflight`
 * builds and uploads to TestFlight without requiring a pre-configured submit
 * profile. See https://docs.expo.dev/build-reference/npx-testflight/
 */
export async function runTestFlight(
  projectPath: string,
  profile: string,
  onLogLine?: (line: string, stream: "stdout" | "stderr") => void,
): Promise<string> {
  const args = ["testflight", "--profile", profile];
  if (onLogLine) {
    return runProjectCommandStreaming(projectPath, "npx", args, onLogLine);
  }
  return runProjectCommand(projectPath, "npx", args);
}

export async function deployToStore(
  projectPath: string,
  store: "ios" | "android",
  profile: string,
  easCliPath?: string,
  onLogLine?: (line: string, stream: "stdout" | "stderr") => void,
): Promise<string> {
  const platform = store === "ios" ? "ios" : "android";
  // `--auto-submit` is the correct EAS CLI flag - it queues a submission to
  // the store using the submit profile matching `profile` from eas.json.
  // The old `--submit` was silently ignored, so builds finished but never
  // shipped. We also pass `--auto-submit-with-profile` explicitly so the
  // user's submit profile name is unambiguous even if it differs from the
  // build profile name in the future.
  const args = [
    "build",
    "-p",
    platform,
    "--profile",
    profile,
    "--auto-submit-with-profile",
    profile,
    "--non-interactive",
  ];

  if (onLogLine) {
    return runEasCommandStreaming(projectPath, args, easCliPath, onLogLine);
  }

  return runEasCommand(projectPath, args, easCliPath);
}

export async function publishEasUpdate(
  projectPath: string,
  branch: string,
  message: string,
  easCliPath?: string,
  onLogLine?: (line: string, stream: "stdout" | "stderr") => void,
): Promise<string> {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    throw new Error("Update message is required.");
  }
  if (!branch.trim()) {
    throw new Error("Branch is required.");
  }

  const args = ["update", "--branch", branch.trim(), "--message", trimmedMessage, "--non-interactive"];

  if (onLogLine) {
    return runEasCommandStreaming(projectPath, args, easCliPath, onLogLine);
  }

  return runEasCommand(projectPath, args, easCliPath);
}
