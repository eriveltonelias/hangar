import type { FileSystemAdapter, RouteNode, RouterScanResult, Issue } from "../types/index.js";
import { createIssue, joinPath } from "../utils/helpers.js";

async function readUrlScheme(projectPath: string, fs: FileSystemAdapter): Promise<string | undefined> {
  for (const file of ["app.json", "app.config.json"]) {
    const configPath = joinPath(projectPath, file);
    if (!(await fs.exists(configPath))) continue;

    try {
      const content = await fs.readFile(configPath);
      const json = JSON.parse(content) as {
        expo?: { scheme?: string | string[] };
        scheme?: string | string[];
      };
      const scheme = json.expo?.scheme ?? json.scheme;
      if (typeof scheme === "string" && scheme.length > 0) return scheme;
      if (Array.isArray(scheme) && typeof scheme[0] === "string") return scheme[0];
    } catch {
      /* skip invalid config */
    }
  }
  return undefined;
}

const ROUTE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const ROUTE_SPECIAL = ["_layout", "index", "+not-found", "+html"];

function isRouteFile(name: string): boolean {
  const ext = ROUTE_EXTENSIONS.find((e) => name.endsWith(e));
  if (!ext) return false;
  const base = name.slice(0, -ext.length);
  if (ROUTE_SPECIAL.includes(base)) return true;
  if (base.startsWith("+")) return true;
  if (base.startsWith("(") && base.endsWith(")")) return true;
  if (base.startsWith("[") && base.endsWith("]")) return true;
  if (!base.startsWith("_") || base === "_layout") return true;
  return false;
}

function getRouteType(name: string): RouteNode["type"] {
  const base = name.replace(/\.(tsx|ts|jsx|js)$/, "");
  if (base === "_layout") return "layout";
  if (base === "+not-found") return "not-found";
  if (base.startsWith("+")) return "modal";
  if (base.startsWith("(") && base.endsWith(")")) return "group";
  if (base.startsWith("[") && base.endsWith("]")) return "dynamic";
  return "page";
}

function segmentToPath(segment: string): string {
  if (segment === "index") return "";
  if (segment.startsWith("(") && segment.endsWith(")")) return "";
  if (segment.startsWith("[") && segment.endsWith("]")) {
    const param = segment.slice(1, -1);
    return `:${param.replace(/^\.\.\./, "")}`;
  }
  return segment;
}

function buildDeepLink(path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
    .map((part) => {
      if (part.startsWith("[") && part.endsWith("]")) {
        return `:${part.slice(1, -1).replace(/^\.\.\./, "")}`;
      }
      return part;
    });

  if (segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

async function scanDirectory(
  dirPath: string,
  relativePath: string,
  fs: FileSystemAdapter,
): Promise<RouteNode[]> {
  const entries = await fs.readDir(dirPath);
  const nodes: RouteNode[] = [];
  const routeMap = new Map<string, RouteNode>();

  for (const entry of entries.sort()) {
    if (entry.startsWith(".") || entry === "node_modules") continue;

    const fullPath = joinPath(dirPath, entry);
    const entryRelative = relativePath ? joinPath(relativePath, entry) : entry;

    const isDir = fs.isDirectory
      ? await fs.isDirectory(fullPath)
      : !ROUTE_EXTENSIONS.some((ext) => entry.endsWith(ext));

    if (isDir) {
      const children = await scanDirectory(fullPath, entryRelative, fs);
      const groupName = entry.startsWith("(") ? entry : entry;
      const pathSegment = segmentToPath(entry.replace(/\/$/, ""));
      const currentPath = relativePath
        ? joinPath(relativePath, pathSegment).replace(/\/+/g, "/")
        : pathSegment;

      nodes.push({
        id: entryRelative,
        name: groupName,
        path: buildDeepLink(currentPath),
        filePath: fullPath,
        type: entry.startsWith("(") ? "group" : "page",
        children,
        warnings: [],
      });
      continue;
    }

    if (!isRouteFile(entry)) continue;

    const base = entry.replace(/\.(tsx|ts|jsx|js)$/, "");
    const type = getRouteType(entry);
    const pathSegment = segmentToPath(base);
    const currentPath = relativePath
      ? joinPath(relativePath, pathSegment).replace(/\/+/g, "/")
      : pathSegment;

    const dynamicParams =
      base.startsWith("[") && base.endsWith("]")
        ? [base.slice(1, -1).replace(/^\.\.\./, "")]
        : undefined;

    const warnings: Issue[] = [];
    if (type === "dynamic" && base === "[id]") {
      warnings.push(
        createIssue({
          severity: "info",
          category: "Router",
          title: "Generic dynamic param [id]",
          description: "Consider using a more descriptive param name like [userId] or [slug].",
          filePath: fullPath,
        }),
      );
    }

    const node: RouteNode = {
      id: entryRelative,
      name: base,
      path: buildDeepLink(currentPath),
      filePath: fullPath,
      type,
      children: [],
      dynamicParams,
      deepLinkPattern: buildDeepLink(currentPath),
      warnings,
      isProtected: base.startsWith("(auth)") || relativePath.includes("(auth)"),
    };

    if (routeMap.has(base) && base !== "_layout") {
      warnings.push(
        createIssue({
          severity: "warning",
          category: "Router",
          title: "Duplicate route segment",
          description: `Multiple files resolve to the same route segment "${base}".`,
          filePath: fullPath,
        }),
      );
    }
    routeMap.set(base, node);
    nodes.push(node);
  }

  return nodes;
}

function collectRouteGroups(nodes: RouteNode[], groups: Set<string>): void {
  for (const node of nodes) {
    if (node.type === "group") groups.add(node.name);
    collectRouteGroups(node.children, groups);
  }
}

function collectAllWarnings(nodes: RouteNode[], warnings: Issue[]): void {
  for (const node of nodes) {
    warnings.push(...node.warnings);
    collectAllWarnings(node.children, warnings);
  }
}

function hasNotFoundRoute(nodes: RouteNode[]): boolean {
  for (const node of nodes) {
    if (node.type === "not-found") return true;
    if (hasNotFoundRoute(node.children)) return true;
  }
  return false;
}

function checkMissingLayouts(nodes: RouteNode[], warnings: Issue[]): void {
  for (const node of nodes) {
    if (node.type === "group" || node.children.length > 0) {
      const childHasLayout = node.children.some((c) => c.type === "layout");
      if (node.children.length > 0 && !childHasLayout && node.type !== "layout") {
        const subdirs = node.children.filter((c) => c.children.length > 0);
        for (const sub of subdirs) {
          const layoutExists = sub.children.some((c) => c.type === "layout");
          if (!layoutExists) {
            warnings.push(
              createIssue({
                severity: "warning",
                category: "Router",
                title: "Missing _layout.tsx",
                description: `Route group "${sub.name}" has nested routes but no _layout.tsx.`,
                filePath: sub.filePath,
                suggestedFix: "Add a _layout.tsx file to define the layout for this route group.",
              }),
            );
          }
        }
      }
    }
    checkMissingLayouts(node.children, warnings);
  }
}

export async function scanRouter(
  projectPath: string,
  fs: FileSystemAdapter,
): Promise<RouterScanResult> {
  const appDirectory = joinPath(projectPath, "app");
  const exists = await fs.exists(appDirectory);

  if (!exists) {
    return {
      projectPath,
      appDirectory,
      routes: [],
      routeGroups: [],
      warnings: [
        createIssue({
          severity: "critical",
          category: "Router",
          title: "No app/ directory",
          description: "Cannot visualize routes without an app/ directory.",
          filePath: appDirectory,
        }),
      ],
      hasNotFound: false,
      urlScheme: undefined,
    };
  }

  const routes = await scanDirectory(appDirectory, "", fs);
  const urlScheme = await readUrlScheme(projectPath, fs);
  const routeGroups: string[] = [];
  const groupSet = new Set<string>();
  collectRouteGroups(routes, groupSet);
  routeGroups.push(...groupSet);

  const warnings: Issue[] = [];
  collectAllWarnings(routes, warnings);
  checkMissingLayouts(routes, warnings);

  const hasNotFound = hasNotFoundRoute(routes);
  if (!hasNotFound) {
    warnings.push(
      createIssue({
        severity: "info",
        category: "Router",
        title: "Missing +not-found route",
        description: "No +not-found.tsx route found. Consider adding one for unmatched routes.",
        filePath: joinPath(appDirectory, "+not-found.tsx"),
        suggestedFix: "Create app/+not-found.tsx to handle 404 routes.",
        docsUrl: "https://docs.expo.dev/router/error-handling/",
      }),
    );
  }

  return {
    projectPath,
    appDirectory,
    routes,
    routeGroups,
    warnings,
    hasNotFound,
    urlScheme,
  };
}

export function flattenRoutes(nodes: RouteNode[]): RouteNode[] {
  const result: RouteNode[] = [];
  function walk(nodeList: RouteNode[]) {
    for (const node of nodeList) {
      result.push(node);
      walk(node.children);
    }
  }
  walk(nodes);
  return result;
}

export function formatRouterTree(nodes: RouteNode[], indent = 0): string {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);
  for (const node of nodes) {
    const icon =
      node.type === "layout" ? "📐" :
      node.type === "group" ? "📁" :
      node.type === "dynamic" ? "🔗" :
      node.type === "not-found" ? "❓" :
      node.type === "modal" ? "🪟" : "📄";
    lines.push(`${prefix}${icon} ${node.name} → ${node.path}`);
    if (node.children.length > 0) {
      lines.push(formatRouterTree(node.children, indent + 1));
    }
  }
  return lines.join("\n");
}
