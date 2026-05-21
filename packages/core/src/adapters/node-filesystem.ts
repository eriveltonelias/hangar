import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { FileSystemAdapter } from "../types/index.js";

function readDirRecursiveSync(dirPath: string, basePath: string): string[] {
  const results: string[] = [];
  if (!existsSync(dirPath)) return results;

  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...readDirRecursiveSync(fullPath, basePath));
    } else {
      results.push(relative(basePath, fullPath));
    }
  }
  return results;
}

export function createNodeFileSystem(projectPath: string): FileSystemAdapter {
  const resolve = (path: string) =>
    path.startsWith("/") ? path : join(projectPath, path);

  return {
    async exists(path: string): Promise<boolean> {
      return existsSync(resolve(path));
    },
    async readFile(path: string): Promise<string> {
      return readFileSync(resolve(path), "utf-8");
    },
    async readDir(path: string): Promise<string[]> {
      const fullPath = resolve(path);
      if (!existsSync(fullPath)) return [];
      return readdirSync(fullPath);
    },
    async isDirectory(path: string): Promise<boolean> {
      const fullPath = resolve(path);
      return existsSync(fullPath) && statSync(fullPath).isDirectory();
    },
    async readDirRecursive(path: string): Promise<string[]> {
      return readDirRecursiveSync(resolve(path), projectPath);
    },
  };
}
