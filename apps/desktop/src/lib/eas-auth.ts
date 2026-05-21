import { isTauri } from "./platform";

export type EasAuthStatus =
  | { state: "logged-in"; username: string }
  | { state: "not-logged-in" }
  | { state: "cli-not-found" }
  | { state: "unavailable" };

export const EAS_LOGIN_STEPS = [
  {
    title: "Install EAS CLI",
    description: "If you don't have it yet, install the Expo Application Services CLI globally.",
    command: "npm install -g eas-cli",
  },
  {
    title: "Log in to Expo",
    description: "Run this in your terminal. It opens a browser to authenticate your Expo account.",
    command: "eas login",
  },
  {
    title: "Verify login",
    description: "Confirm you're signed in. You should see your Expo username.",
    command: "eas whoami",
  },
] as const;

export function easAuthTitle(state: EasAuthStatus["state"]): string {
  if (state === "cli-not-found") return "EAS CLI not found";
  return "Sign in to EAS";
}

export function easAuthDescription(state: EasAuthStatus["state"]): string {
  if (state === "cli-not-found") {
    return "Hangar uses the EAS CLI to load builds, updates, and release data. Install it first, then log in.";
  }
  return "Hangar reads EAS data through the CLI on your machine. Sign in via the terminal to continue.";
}

const LOGIN_ERROR_PATTERNS = [
  "not logged in",
  "must be logged in",
  "you are not logged",
  "authentication required",
  "run eas login",
  "an expo user account is required",
  "forbidden",
  "unauthorized",
  "invalid session",
  "not authenticated",
];

export function parseEasWhoamiOutput(output: string): string | null {
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("★")) continue;
    if (trimmed.startsWith("To upgrade")) continue;
    if (trimmed.startsWith("Proceeding with")) continue;
    if (trimmed.startsWith("npm install")) continue;
    if (trimmed.startsWith("Accounts:")) continue;
    if (trimmed.startsWith("•")) continue;
    if (trimmed.includes("@")) continue;
    return trimmed;
  }
  return null;
}

export function isEasLoginError(message: string): boolean {
  const lower = message.toLowerCase();
  return LOGIN_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function isEasCliMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to run eas") ||
    lower.includes("no such file") ||
    lower.includes("not found") ||
    lower.includes("command not found") ||
    lower.includes("enoent")
  );
}

export async function checkEasAuth(easCliPath?: string): Promise<EasAuthStatus> {
  if (!isTauri()) {
    return { state: "unavailable" };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  try {
    const output = await invoke<string>("check_eas_login", {
      customPath: easCliPath?.trim() || null,
    });
    const username = parseEasWhoamiOutput(output);
    if (username) {
      return { state: "logged-in", username };
    }
    return { state: "not-logged-in" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isEasCliMissingError(message)) {
      return { state: "cli-not-found" };
    }
    if (isEasLoginError(message)) {
      return { state: "not-logged-in" };
    }
    return { state: "not-logged-in" };
  }
}
