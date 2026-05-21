import type {
  BundleCategory,
  BundleCategoryStat,
  BundleFile,
  BundleSizeDelta,
  BundleSizeRaw,
  BundleSizeReport,
} from "../types/index.js";

const EXT_TO_CATEGORY: Record<string, BundleCategory> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsbundle: "javascript",
  hbc: "javascript",
  map: "javascript",
  png: "images",
  jpg: "images",
  jpeg: "images",
  gif: "images",
  webp: "images",
  svg: "images",
  ico: "images",
  bmp: "images",
  ttf: "fonts",
  otf: "fonts",
  woff: "fonts",
  woff2: "fonts",
  eot: "fonts",
  mp3: "media",
  mp4: "media",
  wav: "media",
  m4a: "media",
  mov: "media",
  webm: "media",
  ogg: "media",
  json: "data",
};

export function categoryFromPath(path: string): BundleCategory {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "other";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXT_TO_CATEGORY[ext] ?? "other";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

const ALL_CATEGORIES: BundleCategory[] = ["javascript", "images", "fonts", "media", "data", "other"];

export function buildBundleReport(raw: BundleSizeRaw, scannedAt: string): BundleSizeReport {
  const totals = new Map<BundleCategory, { bytes: number; count: number }>();
  for (const cat of ALL_CATEGORIES) totals.set(cat, { bytes: 0, count: 0 });

  for (const file of raw.files) {
    const cat = file.category ?? categoryFromPath(file.relativePath);
    const entry = totals.get(cat)!;
    entry.bytes += file.bytes;
    entry.count += 1;
  }

  const total = raw.totalBytes || 1;
  const byCategory: BundleCategoryStat[] = ALL_CATEGORIES
    .map<BundleCategoryStat>((category) => {
      const entry = totals.get(category)!;
      return {
        category,
        bytes: entry.bytes,
        fileCount: entry.count,
        share: entry.bytes / total,
      };
    })
    .filter((stat) => stat.fileCount > 0)
    .sort((a, b) => b.bytes - a.bytes);

  const topFiles: BundleFile[] = [...raw.files]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 25);

  return {
    bundleDir: raw.bundleDir,
    scannedAt,
    totalBytes: raw.totalBytes,
    fileCount: raw.fileCount,
    byCategory,
    topFiles,
  };
}

/**
 * Compute the delta between the most recent two snapshots.
 * `severity` thresholds (percent change):
 *   < 2%  → "ok"        (noise floor)
 *   < 5%  → "watch"
 *   <10%  → "warning"
 *   >=10% → "critical"
 */
export function computeBundleDelta(
  previousBytes: number,
  currentBytes: number,
): BundleSizeDelta {
  const absoluteDelta = currentBytes - previousBytes;
  const percentDelta = previousBytes > 0 ? absoluteDelta / previousBytes : 0;
  const abs = Math.abs(percentDelta);
  const severity: BundleSizeDelta["severity"] =
    abs < 0.02 ? "ok" : abs < 0.05 ? "watch" : abs < 0.1 ? "warning" : "critical";
  return { previousBytes, currentBytes, absoluteDelta, percentDelta, severity };
}

export function categoryLabel(category: BundleCategory): string {
  switch (category) {
    case "javascript":
      return "JavaScript";
    case "images":
      return "Images";
    case "fonts":
      return "Fonts";
    case "media":
      return "Audio / Video";
    case "data":
      return "Data (JSON)";
    case "other":
      return "Other";
  }
}
