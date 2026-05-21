import type { AppSettings } from "@expopilot/core";
import { isTauri } from "./platform";

export type ThemePreference = AppSettings["theme"];
export type ResolvedTheme = "dark" | "light";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") {
    return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
  }
  return preference;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;

  root.classList.remove("dark", "light");
  root.classList.add(resolved);
  root.dataset.theme = preference;
  root.style.colorScheme = resolved;

  void syncNativeTheme(preference, resolved);

  return resolved;
}

async function syncNativeTheme(
  preference: ThemePreference,
  resolved: ResolvedTheme,
): Promise<void> {
  if (!isTauri()) return;

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const windowTheme = preference === "system" ? null : resolved;
    await getCurrentWindow().setTheme(windowTheme);
  } catch {
    /* native theme sync is best-effort */
  }
}

let systemListener: ((event: MediaQueryListEvent) => void) | null = null;

export function watchSystemTheme(preference: ThemePreference): void {
  const media = window.matchMedia(MEDIA_QUERY);

  if (systemListener) {
    media.removeEventListener("change", systemListener);
    systemListener = null;
  }

  if (preference !== "system") return;

  systemListener = () => {
    applyTheme("system");
  };
  media.addEventListener("change", systemListener);
}

export function initTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = applyTheme(preference);
  watchSystemTheme(preference);
  return resolved;
}
