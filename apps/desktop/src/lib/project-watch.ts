import { isTauri } from "./platform";

const DEBOUNCE_MS = 400;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unlisten: (() => void) | null = null;
let watchedPath: string | null = null;

export async function startProjectWatch(
  projectPath: string,
  onChange: (path: string) => void,
): Promise<void> {
  if (!isTauri()) return;

  await stopProjectWatch();

  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  watchedPath = projectPath;
  await invoke("watch_project", { projectPath });

  unlisten = await listen<{ projectPath: string }>("project-files-changed", (event) => {
    if (event.payload.projectPath !== projectPath) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChange(projectPath);
    }, DEBOUNCE_MS);
  });
}

export async function stopProjectWatch(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (unlisten) {
    unlisten();
    unlisten = null;
  }

  if (watchedPath && isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("unwatch_project").catch(() => undefined);
  }

  watchedPath = null;
}
