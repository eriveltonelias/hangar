import type { ExpoDoctorResult } from "../types/index.js";

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function parseExpoDoctorOutput(raw: string): ExpoDoctorResult {
  const output = stripAnsi(raw).trim();
  const ranAt = new Date().toISOString();

  const summaryMatch = output.match(/(\d+)\/(\d+)\s+checks\s+passed/i);
  if (!summaryMatch) {
    const errorLine =
      output
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("Error:")) ?? output.split("\n")[0];

    return {
      status: "error",
      passed: 0,
      total: 0,
      checks: [],
      error: errorLine?.trim() || "expo-doctor failed to run",
      ranAt,
    };
  }

  const passed = Number.parseInt(summaryMatch[1], 10);
  const total = Number.parseInt(summaryMatch[2], 10);
  const checks: ExpoDoctorResult["checks"] = [];

  for (const section of output.split(/\n(?=✖\s)/)) {
    if (!section.trim().startsWith("✖")) continue;

    const lines = section.split("\n");
    const title = lines[0].replace(/^✖\s*/, "").trim();
    const adviceIndex = lines.findIndex((line) => line.trim() === "Advice:");
    const details = lines
      .slice(1, adviceIndex >= 0 ? adviceIndex : undefined)
      .join("\n")
      .trim();
    const advice =
      adviceIndex >= 0
        ? lines
            .slice(adviceIndex + 1)
            .join("\n")
            .trim()
        : undefined;

    checks.push({
      id: slugify(title),
      title,
      passed: false,
      details: details || undefined,
      advice: advice || undefined,
    });
  }

  return {
    status: passed === total ? "success" : "failed",
    passed,
    total,
    checks,
    ranAt,
  };
}
