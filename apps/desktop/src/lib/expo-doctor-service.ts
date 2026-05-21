import { parseExpoDoctorOutput, type ExpoDoctorResult } from "@expopilot/core";
import { runProjectCommand } from "./services";
import { formatError } from "./errors";
import { isTauri } from "./platform";

export async function runExpoDoctor(projectPath: string): Promise<ExpoDoctorResult> {
  if (!isTauri()) {
    return {
      status: "error",
      passed: 0,
      total: 0,
      checks: [],
      error: "expo-doctor requires the ExpoPilot desktop app",
      ranAt: new Date().toISOString(),
    };
  }

  try {
    const output = await runProjectCommand(projectPath, "npx", ["expo-doctor"]);
    return parseExpoDoctorOutput(output);
  } catch (err) {
    const message = formatError(err);
    const parsed = parseExpoDoctorOutput(message);
    if (parsed.total > 0) {
      return parsed;
    }
    return {
      status: "error",
      passed: 0,
      total: 0,
      checks: [],
      error: message,
      ranAt: new Date().toISOString(),
    };
  }
}
