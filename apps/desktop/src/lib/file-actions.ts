import type { AppSettings } from "@hangar/core";
import { openInEditor, revealInFileManager } from "./services";
import { toast } from "./notify";

/**
 * Wrappers around the raw Tauri commands that show a toast on failure.
 * Screens should prefer these - the raw `services.ts` versions reject with
 * an error that's easy to swallow accidentally (a dead-looking click is
 * worse than a visible "couldn't open" message).
 */

export async function openInEditorWithFeedback(
  path: string,
  editor: AppSettings["preferredEditor"],
): Promise<void> {
  try {
    await openInEditor(path, editor);
  } catch (err) {
    toast.error({
      title: "Could not open in editor",
      description:
        (err instanceof Error ? err.message : String(err)) +
        " - set your preferred editor in Settings, or install its CLI (Cursor / VS Code).",
    });
  }
}

export async function revealInFileManagerWithFeedback(path: string): Promise<void> {
  try {
    await revealInFileManager(path);
  } catch (err) {
    toast.error({
      title: "Could not reveal file",
      description: err instanceof Error ? err.message : String(err),
    });
  }
}
