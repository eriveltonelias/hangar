import { parseExpoConfigOutput, type ExpoConfigResult } from "@hangar/core";
import { runProjectCommand } from "./services";
import { formatError } from "./errors";
import { isTauri } from "./platform";

export async function runExpoConfigCheck(projectPath: string): Promise<ExpoConfigResult> {
  if (!isTauri()) {
    return {
      status: "error",
      ranAt: new Date().toISOString(),
      error: "Expo config validation requires the Hangar desktop app",
    };
  }

  try {
    const output = await runProjectCommand(projectPath, "npx", [
      "expo",
      "config",
      "--type",
      "public",
    ]);
    return parseExpoConfigOutput(output, true);
  } catch (err) {
    const message = formatError(err);
    const parsed = parseExpoConfigOutput(message, false);
    if (parsed.error && parsed.error !== "expo config failed to load") {
      return parsed;
    }
    return {
      status: "failed",
      ranAt: new Date().toISOString(),
      error: message,
    };
  }
}
