import type { RouteNode } from "../types/index.js";

export interface RouteDeepLinkSchema {
  routeId: string;
  name: string;
  type: RouteNode["type"];
  /** Expo Router path pattern, e.g. /user/:id */
  pathPattern: string;
  /** Concrete example path for testing, e.g. /user/123 */
  examplePath: string;
  /** Custom scheme URL, e.g. myapp://user/123 */
  schemeUrl?: string;
  /** Custom scheme URL pattern, e.g. myapp://user/:id */
  schemeUrlPattern?: string;
  dynamicParams?: string[];
  isProtected?: boolean;
  filePath: string;
}

export interface DeepLinkPathParam {
  name: string;
  example: string;
  /** Segment in the path pattern, e.g. :id */
  segment: string;
}

export interface DeepLinkParamGuide {
  pathParams: DeepLinkPathParam[];
  hasPathParams: boolean;
  /** App path - used by universal links and Expo linking config */
  universalPath: string;
  universalPathPattern: string;
  /** Path + query string deep link (no scheme) */
  universalPathWithQuery: string;
  /** scheme://path */
  schemeUrl?: string;
  /** scheme://path/:param pattern */
  schemeUrlPattern?: string;
  /** scheme://path?query=params */
  schemeUrlWithQuery?: string;
  /** Linking.openURL(...) */
  linkingOpenUrl?: string;
  testCommandIos?: string;
  testCommandAndroid?: string;
  readParamsCode: string;
  tips: string[];
}

const NAVIGABLE_TYPES = new Set<RouteNode["type"]>(["page", "dynamic", "modal", "not-found"]);

export function isNavigableRoute(node: RouteNode): boolean {
  if (!NAVIGABLE_TYPES.has(node.type)) return false;
  if (node.type === "page" && node.children.length > 0) return false;
  return true;
}

export function exampleParamValue(param: string): string {
  const lower = param.toLowerCase();
  if (lower.includes("slug")) return "my-post";
  if (lower.includes("uuid")) return "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  if (lower.includes("id")) return "123";
  if (lower.includes("name")) return "jane";
  if (lower.includes("token")) return "abc123";
  return "example";
}

export function buildExamplePath(pathPattern: string, dynamicParams?: string[]): string {
  let example = pathPattern;
  if (dynamicParams) {
    for (const param of dynamicParams) {
      example = example.replace(`:${param}`, exampleParamValue(param));
    }
  }
  example = example.replace(/:([a-zA-Z0-9_]+)/g, (_, name: string) => exampleParamValue(name));
  return example === "" ? "/" : example;
}

export function buildSchemeDeepLink(scheme: string, path: string): string {
  const cleaned = path.replace(/^\//, "");
  return cleaned ? `${scheme}://${cleaned}` : `${scheme}://`;
}

export function buildSchemeDeepLinkPattern(scheme: string, pathPattern: string): string {
  const cleaned = pathPattern.replace(/^\//, "");
  return cleaned ? `${scheme}://${cleaned}` : `${scheme}://`;
}

export function appendQueryToUrl(url: string, query: Record<string, string>): string {
  const params = new URLSearchParams(query).toString();
  return params ? `${url}?${params}` : url;
}

export function buildDeepLinkParamGuide(
  schema: RouteDeepLinkSchema,
  urlScheme?: string,
): DeepLinkParamGuide {
  const pathParams: DeepLinkPathParam[] = (schema.dynamicParams ?? []).map((name) => ({
    name,
    example: exampleParamValue(name),
    segment: `:${name}`,
  }));

  const hasPathParams = pathParams.length > 0;
  const universalPath = schema.examplePath;
  const universalPathPattern = schema.pathPattern;
  const queryParams = { ref: "email", source: "notification" };
  const universalPathWithQuery = appendQueryToUrl(universalPath, queryParams);

  const schemeUrl = schema.schemeUrl;
  const schemeUrlPattern = schema.schemeUrlPattern;
  const schemeUrlWithQuery =
    schemeUrl != null ? appendQueryToUrl(schemeUrl, queryParams) : undefined;

  const linkingOpenUrl = schemeUrlWithQuery
    ? `Linking.openURL("${schemeUrlWithQuery}")`
    : undefined;

  const testCommandIos = schemeUrlWithQuery
    ? `npx uri-scheme open '${schemeUrlWithQuery}' --ios`
    : undefined;

  const testCommandAndroid = schemeUrlWithQuery
    ? `npx uri-scheme open '${schemeUrlWithQuery}' --android`
    : undefined;

  const readParamsCode = hasPathParams
    ? `const { ${pathParams.map((p) => p.name).join(", ")} } = useLocalSearchParams();`
    : `const { ref, source } = useLocalSearchParams();`;

  const tips: string[] = [];

  if (hasPathParams) {
    tips.push(
      `Path params go in the URL path itself - replace each segment (e.g. ${pathParams.map((p) => p.segment).join(", ")}) with a real value.`,
    );
    tips.push("Do not pass path params as query strings (?id=123) - they must be path segments (/user/123).");
  } else {
    tips.push("This route has no dynamic path segments in the URL.");
  }

  tips.push("Query params (?ref=email) are optional extras appended after the path - not replacements for path segments.");
  tips.push("When the app opens from a deep link, Expo Router parses the URL path and query into useLocalSearchParams().");

  if (urlScheme) {
    tips.push(`Custom scheme format: ${urlScheme}://path/to/screen - same path structure as universal links.`);
  } else {
    tips.push("Add a scheme in app.json to enable myapp:// deep links. Universal link paths still use the same /path format.");
  }

  return {
    pathParams,
    hasPathParams,
    universalPath,
    universalPathPattern,
    universalPathWithQuery,
    schemeUrl,
    schemeUrlPattern,
    schemeUrlWithQuery,
    linkingOpenUrl,
    testCommandIos,
    testCommandAndroid,
    readParamsCode,
    tips,
  };
}

export function buildRouteDeepLinkSchema(
  node: RouteNode,
  urlScheme?: string,
): RouteDeepLinkSchema {
  const pathPattern = node.path;
  const examplePath = buildExamplePath(pathPattern, node.dynamicParams);

  return {
    routeId: node.id,
    name: node.name,
    type: node.type,
    pathPattern,
    examplePath,
    schemeUrl: urlScheme ? buildSchemeDeepLink(urlScheme, examplePath) : undefined,
    schemeUrlPattern: urlScheme ? buildSchemeDeepLinkPattern(urlScheme, pathPattern) : undefined,
    dynamicParams: node.dynamicParams,
    isProtected: node.isProtected,
    filePath: node.filePath,
  };
}

export function collectDeepLinkSchemas(
  routes: RouteNode[],
  urlScheme?: string,
): RouteDeepLinkSchema[] {
  const schemas: RouteDeepLinkSchema[] = [];

  function walk(nodes: RouteNode[]) {
    for (const node of nodes) {
      if (isNavigableRoute(node)) {
        schemas.push(buildRouteDeepLinkSchema(node, urlScheme));
      }
      if (node.children.length > 0) walk(node.children);
    }
  }

  walk(routes);
  return schemas;
}

export function getRouteBreadcrumb(node: RouteNode, routes: RouteNode[]): string[] {
  const parts: string[] = [];

  function findPath(nodes: RouteNode[], trail: string[]): boolean {
    for (const n of nodes) {
      const next = [...trail, n.name];
      if (n.id === node.id) {
        parts.push(...next);
        return true;
      }
      if (n.children.length > 0 && findPath(n.children, next)) return true;
    }
    return false;
  }

  findPath(routes, []);
  return parts;
}

export function pathPatternToFileRoute(pathPattern: string): string {
  return pathPattern.replace(/:([a-zA-Z0-9_]+)/g, "[$1]");
}
