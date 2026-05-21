const buildLogCache = new Map<string, string>();

function cacheKey(projectPath: string, buildId: string): string {
  return `${projectPath}::${buildId}`;
}

export function getCachedBuildLog(projectPath: string, buildId: string): string | undefined {
  return buildLogCache.get(cacheKey(projectPath, buildId));
}

export function setCachedBuildLog(projectPath: string, buildId: string, log: string): void {
  buildLogCache.set(cacheKey(projectPath, buildId), log);
}

export function clearProjectBuildLogs(projectPath: string): void {
  const prefix = `${projectPath}::`;
  for (const key of buildLogCache.keys()) {
    if (key.startsWith(prefix)) {
      buildLogCache.delete(key);
    }
  }
}
