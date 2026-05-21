import type { AppSettings, FileSystemAdapter, ScanResult, RouterScanResult } from "@expopilot/core";
import { scanProject, scanRouter } from "@expopilot/core";
import { isTauri } from "./platform";
import { formatError, normalizeProjectPath } from "./errors";
import {
  getActiveProjectPath,
  getSavedProjects,
  normalizeProjectSettings,
} from "./projects";

const DEFAULT_SETTINGS: AppSettings = {
  preferredEditor: "cursor",
  scanFrequency: "manual",
  theme: "dark",
  projects: [],
};

const SETTINGS_KEY = "expopilot-settings";
const HEALTH_HISTORY_PREFIX = "expopilot-health-history:";

export interface HealthHistoryEntry {
  date: string;
  score: number;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return normalizeProjectSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeProjectSettings(settings)));
}

function healthHistoryKey(projectPath: string): string {
  return `${HEALTH_HISTORY_PREFIX}${projectPath}`;
}

export function loadHealthHistory(projectPath?: string): HealthHistoryEntry[] {
  if (!projectPath) return [];
  try {
    const raw = localStorage.getItem(healthHistoryKey(projectPath));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

export function appendHealthHistory(projectPath: string, score: number): HealthHistoryEntry[] {
  const history = loadHealthHistory(projectPath);
  const today = new Date().toISOString().slice(0, 10);
  const existing = history.findIndex((h) => h.date.startsWith(today));
  const entry = { date: new Date().toISOString(), score };
  if (existing >= 0) {
    history[existing] = entry;
  } else {
    history.push(entry);
  }
  const trimmed = history.slice(-30);
  localStorage.setItem(healthHistoryKey(projectPath), JSON.stringify(trimmed));
  return trimmed;
}

export { getActiveProjectPath, getSavedProjects, normalizeProjectSettings };

async function getTauriFs(_projectPath: string): Promise<FileSystemAdapter> {
  const { invoke } = await import("@tauri-apps/api/core");

  async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    try {
      return await invoke<T>(cmd, args);
    } catch (err) {
      throw new Error(formatError(err));
    }
  }

  return {
    async exists(path: string) {
      return call<boolean>("file_exists", { path });
    },
    async readFile(path: string) {
      return call<string>("read_file", { path });
    },
    async readDir(path: string) {
      return call<string[]>("read_dir", { path });
    },
    async isDirectory(path: string) {
      return call<boolean>("is_directory", { path });
    },
  };
}

async function getWebFs(projectPath: string): Promise<FileSystemAdapter> {
  const { webFileSystem } = await import("./web-filesystem");
  return webFileSystem(projectPath);
}

export async function createProjectFs(projectPath: string): Promise<FileSystemAdapter> {
  if (isTauri()) {
    return getTauriFs(projectPath);
  }
  return getWebFs(projectPath);
}

export async function selectProjectFolder(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Expo Project Folder",
    });
    return normalizeProjectPath(selected);
  }
  const path = prompt("Enter project path (web mode):");
  return path ? normalizeProjectPath(path) : null;
}

export async function runProjectScan(projectPath: string): Promise<ScanResult> {
  const fs = await createProjectFs(projectPath);
  return scanProject(projectPath, fs);
}

export async function runRouterScan(projectPath: string): Promise<RouterScanResult> {
  const fs = await createProjectFs(projectPath);
  return scanRouter(projectPath, fs);
}

export async function checkEasCliInstalled(customPath?: string): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("check_eas_cli", { customPath: customPath ?? null });
  }
  return false;
}

export async function openInEditor(filePath: string, editor: AppSettings["preferredEditor"]): Promise<void> {
  if (!isTauri() || editor === "none") return;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("open_in_editor", { filePath, editor });
  } catch (err) {
    throw new Error(formatError(err));
  }
}

export async function revealInFileManager(path: string): Promise<void> {
  if (!isTauri()) {
    throw new Error("Reveal-in-file-manager is only available in the desktop app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("reveal_in_file_manager", { path });
  } catch (err) {
    throw new Error(formatError(err));
  }
}

export async function runProjectCommand(
  projectPath: string,
  command: string,
  args: string[],
): Promise<string> {
  if (!isTauri()) {
    throw new Error("CLI commands require the desktop app");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<string>("run_command", { projectPath, command, args });
  } catch (err) {
    throw new Error(formatError(err));
  }
}

export async function runEasCommand(
  projectPath: string,
  args: string[],
  easCliPath?: string,
): Promise<string> {
  const command = easCliPath?.trim() || "eas";
  return runProjectCommand(projectPath, command, args);
}

export interface EasCommandLogEvent {
  job_id: string;
  line: string;
  stream: "stdout" | "stderr";
}

/** Generic streaming runner - any allowed CLI (eas, npx, expo). */
export async function runProjectCommandStreaming(
  projectPath: string,
  command: string,
  args: string[],
  onLine: (line: string, stream: "stdout" | "stderr") => void,
): Promise<string> {
  if (!isTauri()) {
    throw new Error("CLI commands require the desktop app");
  }

  const jobId = crypto.randomUUID();
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  const unlisten = await listen<EasCommandLogEvent>("eas-command-log", (event) => {
    if (event.payload.job_id !== jobId) return;
    onLine(event.payload.line, event.payload.stream);
  });

  try {
    return await invoke<string>("run_command_streaming", {
      projectPath,
      command,
      args,
      jobId,
    });
  } catch (err) {
    throw new Error(formatError(err));
  } finally {
    unlisten();
  }
}

export async function runEasCommandStreaming(
  projectPath: string,
  args: string[],
  easCliPath: string | undefined,
  onLine: (line: string, stream: "stdout" | "stderr") => void,
): Promise<string> {
  const command = easCliPath?.trim() || "eas";
  return runProjectCommandStreaming(projectPath, command, args, onLine);
}

export interface GitStatusResult {
  clean: boolean;
  changes: string[];
  lastCommitMessage?: string | null;
}

export async function checkGitStatus(projectPath: string): Promise<GitStatusResult> {
  if (!isTauri()) {
    throw new Error("Git checks require the desktop app");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<GitStatusResult>("check_git_status", { projectPath });
  } catch (err) {
    throw new Error(formatError(err));
  }
}
