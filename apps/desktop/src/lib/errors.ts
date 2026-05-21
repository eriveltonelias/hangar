/** Extract a readable message from Tauri invoke / plugin errors. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** Normalize paths returned by the native folder picker. */
export function normalizeProjectPath(path: unknown): string | null {
  if (path == null) return null;
  if (typeof path === "string") {
    const trimmed = path.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("file://")) {
      try {
        return decodeURIComponent(new URL(trimmed).pathname);
      } catch {
        return trimmed.replace(/^file:\/\//, "");
      }
    }
    return trimmed;
  }
  if (typeof path === "object" && path !== null) {
    const record = path as Record<string, unknown>;
    if (typeof record.path === "string") return normalizeProjectPath(record.path);
  }
  return null;
}
