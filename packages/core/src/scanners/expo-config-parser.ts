import type { ExpoConfigResult } from "../types/index.js";

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
}

function extractSlugFromConfig(raw: string): string | undefined {
  const cleaned = stripAnsi(raw).trim();
  if (!cleaned) return undefined;

  try {
    const parsed = JSON.parse(cleaned) as { expo?: { slug?: string }; slug?: string };
    return parsed.expo?.slug ?? parsed.slug;
  } catch {
    const match = cleaned.match(/"slug"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }
}

function extractConfigError(raw: string): string {
  const lines = stripAnsi(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const errorLine = lines.find(
    (line) =>
      /^error:/i.test(line) ||
      line.includes("PluginError") ||
      line.includes("Failed to read") ||
      line.includes("Cannot find module"),
  );

  if (errorLine) return errorLine.replace(/^error:\s*/i, "");
  return lines.slice(-4).join("\n") || "expo config failed to load";
}

export function parseExpoConfigOutput(raw: string, succeeded: boolean): ExpoConfigResult {
  const ranAt = new Date().toISOString();

  if (succeeded) {
    return {
      status: "success",
      ranAt,
      slug: extractSlugFromConfig(raw),
    };
  }

  return {
    status: "failed",
    ranAt,
    error: extractConfigError(raw),
  };
}
