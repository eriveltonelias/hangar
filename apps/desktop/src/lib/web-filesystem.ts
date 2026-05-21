import type { FileSystemAdapter } from "@expopilot/core";

/**
 * Web mode (`pnpm dev:web`) has no real filesystem access - browsers can't
 * read arbitrary paths off disk. The previous version of this module faked
 * an in-memory "demo" project so the UI had something to render; that was
 * removed because the fabricated data misled users about what the app
 * could actually inspect.
 *
 * The adapter below fails fast for every operation. Screens that gate on
 * `isTauri()` already render a desktop-required message; this just makes
 * sure anything that slips through surfaces a clear error instead of
 * silently returning lies.
 */
const NOT_AVAILABLE = new Error(
  "Filesystem access is only available in the ExpoPilot desktop app.",
);

export function webFileSystem(_projectPath: string): FileSystemAdapter {
  return {
    async exists() {
      return false;
    },
    async readFile() {
      throw NOT_AVAILABLE;
    },
    async readDir() {
      throw NOT_AVAILABLE;
    },
    async isDirectory() {
      return false;
    },
  };
}
