import { describe, it, expect } from "vitest";
import {
  buildBundleReport,
  categoryFromPath,
  categoryLabel,
  computeBundleDelta,
  formatBytes,
} from "./categorize.js";
import type { BundleSizeRaw } from "../types/index.js";

describe("categoryFromPath", () => {
  it.each([
    ["app/index.js", "javascript"],
    ["bundle.mjs", "javascript"],
    ["bundle.cjs", "javascript"],
    ["main.jsbundle", "javascript"],
    ["assets/logo.png", "images"],
    ["assets/photo.JPG", "images"], // case-insensitive
    ["fonts/Inter.ttf", "fonts"],
    ["fonts/Roboto.woff2", "fonts"],
    ["audio/intro.mp3", "media"],
    ["video/teaser.mp4", "media"],
    ["config.json", "data"],
    ["README", "other"],
    ["weird.unknownext", "other"],
  ] as const)("classifies %s as %s", (path, expected) => {
    expect(categoryFromPath(path)).toBe(expected);
  });

  it("treats dotfiles as 'other' (no extension)", () => {
    expect(categoryFromPath(".env")).toBe("other");
  });

  it("uses the final segment of nested paths", () => {
    expect(categoryFromPath("deep/nested/dir/file.png")).toBe("images");
  });
});

describe("formatBytes", () => {
  it("renders B / KB / MB / GB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(150 * 1024)).toBe("150 KB"); // >=100 → no decimal
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });

  it("returns '-' for invalid input", () => {
    expect(formatBytes(NaN)).toBe("-");
    expect(formatBytes(-1)).toBe("-");
    expect(formatBytes(Infinity)).toBe("-");
  });
});

describe("computeBundleDelta", () => {
  it("classifies severity by percent change", () => {
    expect(computeBundleDelta(1000, 1010).severity).toBe("ok"); // 1%
    expect(computeBundleDelta(1000, 1030).severity).toBe("watch"); // 3%
    expect(computeBundleDelta(1000, 1070).severity).toBe("warning"); // 7%
    expect(computeBundleDelta(1000, 1200).severity).toBe("critical"); // 20%
  });

  it("treats large drops as critical too (uses absolute %)", () => {
    expect(computeBundleDelta(1000, 800).severity).toBe("critical");
  });

  it("returns 0% delta when previousBytes is 0", () => {
    const d = computeBundleDelta(0, 500);
    expect(d.percentDelta).toBe(0);
    expect(d.absoluteDelta).toBe(500);
  });

  it("preserves raw absolute delta", () => {
    expect(computeBundleDelta(1000, 1200).absoluteDelta).toBe(200);
    expect(computeBundleDelta(1000, 800).absoluteDelta).toBe(-200);
  });
});

describe("buildBundleReport", () => {
  const raw: BundleSizeRaw = {
    bundleDir: "/dist",
    totalBytes: 4000,
    fileCount: 4,
    files: [
      { path: "/dist/main.js", relativePath: "main.js", bytes: 2000, category: "javascript" },
      { path: "/dist/logo.png", relativePath: "logo.png", bytes: 1500, category: "images" },
      { path: "/dist/font.ttf", relativePath: "font.ttf", bytes: 400, category: "fonts" },
      { path: "/dist/data.json", relativePath: "data.json", bytes: 100, category: "data" },
    ],
  };

  it("aggregates bytes by category and computes share", () => {
    const report = buildBundleReport(raw, "2026-01-01T00:00:00Z");
    const js = report.byCategory.find((c) => c.category === "javascript")!;
    expect(js.bytes).toBe(2000);
    expect(js.fileCount).toBe(1);
    expect(js.share).toBeCloseTo(0.5);
  });

  it("sorts categories by bytes descending", () => {
    const report = buildBundleReport(raw, "2026-01-01T00:00:00Z");
    const sortedBytes = report.byCategory.map((c) => c.bytes);
    expect(sortedBytes).toEqual([...sortedBytes].sort((a, b) => b - a));
  });

  it("omits categories with zero files", () => {
    const report = buildBundleReport(raw, "2026-01-01T00:00:00Z");
    expect(report.byCategory.find((c) => c.category === "media")).toBeUndefined();
    expect(report.byCategory.find((c) => c.category === "other")).toBeUndefined();
  });

  it("caps topFiles at 25 and sorts by bytes desc", () => {
    const big: BundleSizeRaw = {
      bundleDir: "/dist",
      totalBytes: 1000,
      fileCount: 30,
      files: Array.from({ length: 30 }, (_, i) => ({
        path: `/dist/f${i}.js`,
        relativePath: `f${i}.js`,
        bytes: i + 1,
        category: "javascript" as const,
      })),
    };
    const report = buildBundleReport(big, "2026-01-01T00:00:00Z");
    expect(report.topFiles).toHaveLength(25);
    expect(report.topFiles[0].bytes).toBe(30);
    expect(report.topFiles[24].bytes).toBe(6);
  });

  it("falls back to categoryFromPath when file.category is missing", () => {
    const rawNoCat: BundleSizeRaw = {
      bundleDir: "/dist",
      totalBytes: 100,
      fileCount: 1,
      // @ts-expect-error – simulate runtime data without category
      files: [{ path: "/dist/foo.png", relativePath: "foo.png", bytes: 100 }],
    };
    const report = buildBundleReport(rawNoCat, "2026-01-01T00:00:00Z");
    expect(report.byCategory[0].category).toBe("images");
  });
});

describe("categoryLabel", () => {
  it("returns a human label for every category", () => {
    expect(categoryLabel("javascript")).toBe("JavaScript");
    expect(categoryLabel("images")).toBe("Images");
    expect(categoryLabel("fonts")).toBe("Fonts");
    expect(categoryLabel("media")).toBe("Audio / Video");
    expect(categoryLabel("data")).toBe("Data (JSON)");
    expect(categoryLabel("other")).toBe("Other");
  });
});
