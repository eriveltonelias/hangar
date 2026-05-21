import { useMemo, useState } from "react";
import type { RouteNode, RouteDeepLinkSchema, DeepLinkParamGuide } from "@hangar/core";
import {
  collectDeepLinkSchemas,
  buildRouteDeepLinkSchema,
  buildDeepLinkParamGuide,
  getRouteBreadcrumb,
} from "@hangar/core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  ScrollArea,
  Button,
} from "@hangar/ui";
import { useAppStore } from "@/lib/store";
import { EmptyProject, SeverityBadge } from "@/components/shared";
import {
  Folder,
  FileText,
  Layout,
  Link2,
  HelpCircle,
  Layers,
  Lock,
  Copy,
  Check,
  Route,
  ExternalLink,
  ChevronRight,
  Braces,
  Globe,
  ShieldQuestion,
  ChevronDown,
  Terminal,
  Code2,
  AlertTriangle,
} from "lucide-react";

const TYPE_CONFIG = {
  layout: { icon: Layout, label: "Layout", color: "text-violet-400" },
  page: { icon: FileText, label: "Page", color: "text-sky-400" },
  group: { icon: Folder, label: "Group", color: "text-amber-400" },
  dynamic: { icon: Link2, label: "Dynamic", color: "text-emerald-400" },
  "not-found": { icon: HelpCircle, label: "Not Found", color: "text-orange-400" },
  modal: { icon: Layers, label: "Modal", color: "text-pink-400" },
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={handleCopy}>
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function RouteTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: RouteNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: RouteNode) => void;
}) {
  const config = TYPE_CONFIG[node.type];
  const Icon = config.icon;
  const isSelected = selectedId === node.id;
  const showPath = node.type !== "layout" && node.type !== "group";

  return (
    <div className="relative">
      {depth > 0 && (
        <span
          className="pointer-events-none absolute top-0 bottom-0 border-l border-border/60"
          style={{ left: `${depth * 20 - 6}px` }}
        />
      )}
      <button
        type="button"
        onClick={() => onSelect(node)}
        title={config.label}
        className={`group relative flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
          isSelected
            ? "border border-primary/30 bg-primary/10"
            : "border border-transparent hover:bg-muted/50"
        }`}
        style={{ marginLeft: `${depth * 20}px`, width: `calc(100% - ${depth * 20}px)` }}
      >
        <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium">{node.name}</span>
            {node.isProtected && <Lock className="h-3 w-3 shrink-0 text-warning" />}
          </div>
          {showPath && (
            <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
              {node.path}
            </span>
          )}
        </div>
      </button>
      {node.children.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <RouteTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function findNodeById(nodes: RouteNode[], id: string): RouteNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = findNodeById(n.children, id);
    if (child) return child;
  }
  return null;
}

function CodeBlock({ label, code, description }: { label: string; code: string; description?: string }) {
  return (
    // Terminal-style surface: explicit zinc shades so light/dark theme don't
    // collapse the text into the near-black background.
    <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0f] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
        <CopyButton value={code} />
      </div>
      {description && <p className="mt-1 text-[11px] text-zinc-500">{description}</p>}
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-100">
        {code}
      </pre>
    </div>
  );
}

function Disclosure({
  icon: Icon,
  label,
  count,
  defaultOpen = false,
  children,
}: {
  icon: typeof Braces;
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border/60 bg-card/40 open:bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
        <span className="flex items-center gap-2 text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
          {typeof count === "number" && (
            <Badge variant="secondary" className="font-normal">
              {count}
            </Badge>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-border/60 p-4">{children}</div>
    </details>
  );
}

function ParamsTable({ guide }: { guide: DeepLinkParamGuide }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-2 font-semibold uppercase tracking-wider text-muted-foreground">
              Param
            </th>
            <th className="px-3 py-2 font-semibold uppercase tracking-wider text-muted-foreground">
              URL segment
            </th>
            <th className="px-3 py-2 font-semibold uppercase tracking-wider text-muted-foreground">
              Example value
            </th>
          </tr>
        </thead>
        <tbody>
          {guide.pathParams.map((p) => (
            <tr key={p.name} className="border-t border-border/40">
              <td className="px-3 py-2 font-mono font-medium">{p.name}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{p.segment}</td>
              <td className="px-3 py-2 font-mono text-foreground/90">{p.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParamGuideSection({ guide, scheme }: { guide: DeepLinkParamGuide; scheme?: string }) {
  // Counts let the disclosures show their weight at a glance without opening them.
  const patternCount =
    1 + // universal path
    (scheme && guide.schemeUrlPattern ? 1 : 0) +
    (guide.schemeUrl ? 1 : 0) +
    1; // with query
  const testCount = (guide.testCommandIos ? 1 : 0) + (guide.testCommandAndroid ? 1 : 0);
  const codeCount = 1 + (guide.linkingOpenUrl ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Braces className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Deep link parameters</p>
          <p className="text-xs text-muted-foreground">
            Path values go in the URL path; extras as <code className="font-mono">?query=params</code>.
          </p>
        </div>
      </div>

      {guide.hasPathParams ? (
        <ParamsTable guide={guide} />
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          No path params. Append optional data with <code className="font-mono">?key=value</code> after
          the path.
        </p>
      )}

      <Disclosure icon={Link2} label="URL patterns" count={patternCount} defaultOpen>
        <CodeBlock
          label="Universal link path"
          code={guide.universalPath}
          description={`Pattern: ${guide.universalPathPattern} - for app.json linking or your https://domain`}
        />
        {scheme && guide.schemeUrlPattern && (
          <CodeBlock
            label="Scheme URL pattern"
            code={guide.schemeUrlPattern}
            description={`Replace ${guide.pathParams.map((p) => p.segment).join(", ") || "segments"} with real values`}
          />
        )}
        {guide.schemeUrl && (
          <CodeBlock
            label="Scheme URL (example)"
            code={guide.schemeUrl}
            description="Concrete deep link with path params filled in"
          />
        )}
        <CodeBlock
          label="With query params"
          code={guide.schemeUrlWithQuery ?? guide.universalPathWithQuery}
          description="Optional ?ref=email&source=notification after the path"
        />
      </Disclosure>

      {testCount > 0 && (
        <Disclosure icon={Terminal} label="Test on a simulator / device" count={testCount}>
          {guide.testCommandIos && (
            <CodeBlock
              label="iOS simulator"
              code={guide.testCommandIos}
              description="Opens the app directly to this URL"
            />
          )}
          {guide.testCommandAndroid && (
            <CodeBlock
              label="Android"
              code={guide.testCommandAndroid}
              description="Opens the app directly to this URL"
            />
          )}
        </Disclosure>
      )}

      <Disclosure icon={Code2} label="Code samples" count={codeCount}>
        {guide.linkingOpenUrl && (
          <CodeBlock
            label="Open programmatically"
            code={`import { Linking } from "react-native";\n\nawait ${guide.linkingOpenUrl};`}
            description="Trigger this deep link from inside or outside the app"
          />
        )}
        <CodeBlock
          label="Read params when app opens"
          code={`import { useLocalSearchParams } from "expo-router";\n\n${guide.readParamsCode}`}
          description="Path + query params arrive here as strings"
        />
      </Disclosure>

      {guide.tips.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {guide.tips.map((tip) => (
            <li key={tip} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeepLinkField({
  label,
  value,
  description,
  mono = true,
}: {
  label: string;
  value: string;
  description?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <CopyButton value={value} />
      </div>
      {description && <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>}
      <p
        className={`mt-2 break-all text-sm ${mono ? "font-mono text-[12px] leading-relaxed text-foreground/90" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export function RouterScreen() {
  const routerResult = useAppStore((s) => s.routerResult);
  const projectPath = useAppStore((s) => s.projectPath);
  const isScanning = useAppStore((s) => s.isScanning);
  const [selected, setSelected] = useState<RouteNode | null>(null);

  const deepLinks = useMemo(
    () => (routerResult ? collectDeepLinkSchemas(routerResult.routes, routerResult.urlScheme) : []),
    [routerResult],
  );

  const selectedNode = useMemo(() => {
    if (!routerResult) return null;
    if (selected) return selected;
    const first = deepLinks[0];
    if (!first) return null;
    return findNodeById(routerResult.routes, first.routeId);
  }, [selected, deepLinks, routerResult]);

  if (!projectPath) return <EmptyProject />;

  if (!routerResult) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">
          {isScanning ? "Scanning routes…" : "Route data is not available yet."}
        </p>
      </div>
    );
  }

  const selectedSchema = selectedNode
    ? buildRouteDeepLinkSchema(selectedNode, routerResult.urlScheme)
    : null;
  const paramGuide = selectedSchema
    ? buildDeepLinkParamGuide(selectedSchema, routerResult.urlScheme)
    : null;
  const breadcrumb = selectedNode ? getRouteBreadcrumb(selectedNode, routerResult.routes) : [];

  return (
    <div className="flex min-h-full flex-col gap-5 p-6">
      <header className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Expo Router</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Route tree and deep link paths from{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">app/</code>
          </p>
        </div>
        {routerResult.urlScheme && (
          <Badge variant="secondary" className="font-mono text-xs font-normal">
            scheme://{routerResult.urlScheme}
          </Badge>
        )}
      </header>

      {!routerResult.urlScheme && <MissingSchemeBanner />}

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Route} label="Routes" value={deepLinks.length} />
        <StatCard icon={Folder} label="Groups" value={routerResult.routeGroups.length} />
        <StatCard
          icon={Globe}
          label="URL scheme"
          value={routerResult.urlScheme ?? "Not set"}
          mono
          tone={routerResult.urlScheme ? undefined : "warning"}
        />
        <StatCard
          icon={ShieldQuestion}
          label="404 handler"
          value={routerResult.hasNotFound ? "Configured" : "Missing"}
          tone={routerResult.hasNotFound ? "success" : "warning"}
        />
      </div>

      <div className="grid min-h-[480px] flex-1 gap-4 xl:grid-cols-5">
        <Card className="flex min-h-0 flex-col overflow-hidden xl:col-span-2">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">Route Tree</CardTitle>
            <CardDescription className="mt-1">File structure mapped to URL paths</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <ScrollArea className="h-[min(52vh,520px)]">
              <div className="space-y-1 p-4">
                {routerResult.routes.length > 0 ? (
                  routerResult.routes.map((node) => (
                    <RouteTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedId={selectedNode?.id ?? null}
                      onSelect={setSelected}
                    />
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No routes found in app/ directory.
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden xl:col-span-3">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">Deep Link Schema</CardTitle>
            <CardDescription className="mt-1">
              Exact paths to use for navigation, linking, and testing
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-5">
            {selectedNode && selectedSchema ? (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {breadcrumb.map((part, i) => (
                      <span key={`${part}-${i}`} className="flex items-center gap-1.5">
                        {i > 0 && <ChevronRight className="h-3 w-3" />}
                        <span className="font-medium text-foreground">{part}</span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {selectedNode.type}
                    </Badge>
                    {selectedNode.isProtected && (
                      <Badge variant="warning">Protected</Badge>
                    )}
                    {selectedNode.dynamicParams?.map((p) => (
                      <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                        :{p}
                      </Badge>
                    ))}
                  </div>
                </div>

                <DeepLinkField
                  label="Path pattern"
                  value={selectedSchema.pathPattern}
                  description="URL path template -:param segments are replaced with real values in deep links"
                />

                {paramGuide && (
                  <ParamGuideSection guide={paramGuide} scheme={routerResult.urlScheme} />
                )}

                {selectedSchema.schemeUrlPattern && (
                  <DeepLinkField
                    label="Scheme URL pattern"
                    value={selectedSchema.schemeUrlPattern}
                    description="Deep link template - swap :param segments for real values"
                  />
                )}
                {selectedSchema.schemeUrl && (
                  <DeepLinkField
                    label="Scheme URL (example)"
                    value={selectedSchema.schemeUrl}
                    description={`Opens app via ${routerResult.urlScheme}://`}
                  />
                )}
                {!selectedSchema.schemeUrl && (
                  <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
                    Add a <code className="font-mono text-xs">scheme</code> in app.json to generate
                    custom scheme deep links.
                  </div>
                )}

                <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0f] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Source file
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] text-zinc-300">
                    {selectedNode.filePath.replace(projectPath, "").replace(/^\//, "")}
                  </p>
                </div>

                {selectedNode.warnings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Route warnings
                    </p>
                    {selectedNode.warnings.map((w) => (
                      <div key={w.id} className="rounded-lg border border-border/60 p-3">
                        <SeverityBadge severity={w.severity} />
                        <p className="mt-2 text-sm text-muted-foreground">{w.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
                <Route className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Select a route</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Click any route in the tree to see its deep link schema and example paths.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shrink-0 overflow-hidden">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">All Deep Links</CardTitle>
              <CardDescription className="mt-1">
                Reference table for every navigable route in your app
              </CardDescription>
            </div>
            <Badge variant="secondary" className="font-normal">
              {deepLinks.length} routes
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {deepLinks.length > 0 ? (
            <ScrollArea className="max-h-[360px]">
              <table className="w-full table-fixed border-collapse">
                <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <tr className="border-b border-border text-left">
                    <th className="w-[140px] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Route
                    </th>
                    <th className="w-[140px] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Pattern
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Example
                    </th>
                    <th className="hidden w-[200px] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">
                      Scheme URL
                    </th>
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {deepLinks.map((link) => (
                    <DeepLinkRow
                      key={link.routeId}
                      link={link}
                      isSelected={selectedNode?.id === link.routeId}
                      onSelect={() => {
                        const node = findNodeById(routerResult.routes, link.routeId);
                        if (node) setSelected(node);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No navigable routes found.</p>
          )}
        </CardContent>
      </Card>

      {routerResult.warnings.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">Router Warnings ({routerResult.warnings.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-4">
            {routerResult.warnings.map((w) => (
              <div key={w.id} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <SeverityBadge severity={w.severity} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{w.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{w.description}</p>
                  {w.docsUrl && (
                    <a
                      href={w.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Documentation
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MissingSchemeBanner() {
  const snippet = `{
  "expo": {
    "scheme": "yourapp"
  }
}`;
  return (
    <div className="flex shrink-0 items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.06] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15">
        <AlertTriangle className="h-4 w-4 text-warning" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="text-sm font-semibold">URL scheme not configured</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Without a scheme, deep links can&apos;t open your app from emails, push notifications,
            QR codes, OAuth callbacks, or other apps. Universal/web links still work, but the
            <code className="mx-1 rounded bg-secondary/60 px-1 py-0.5 font-mono text-[11px]">
              yourapp://
            </code>
            target won&apos;t exist until you set this.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0f] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Add to app.json
            </p>
            <CopyButton value={snippet} />
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-zinc-100">
            {snippet}
          </pre>
        </div>
        <a
          href="https://docs.expo.dev/guides/linking/#linking-to-your-app"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Expo linking docs
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  mono,
  tone,
}: {
  icon: typeof Route;
  label: string;
  value: string | number;
  mono?: boolean;
  tone?: "success" | "warning";
}) {
  const bg =
    tone === "success"
      ? "bg-success/15"
      : tone === "warning"
        ? "bg-warning/15"
        : "bg-primary/15";
  const fg =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-primary";
  const valueTone =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${fg}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={`mt-0.5 truncate text-lg font-semibold ${mono ? "font-mono text-sm" : ""} ${valueTone}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function DeepLinkRow({
  link,
  isSelected,
  onSelect,
}: {
  link: RouteDeepLinkSchema;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const copyValue = link.schemeUrl ?? link.examplePath;

  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/40 ${
        isSelected ? "bg-primary/[0.06]" : ""
      }`}
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{link.name}</span>
          {link.isProtected && <Lock className="h-3 w-3 shrink-0 text-warning" />}
        </div>
        <Badge variant="outline" className="mt-1 text-[9px] font-normal capitalize">
          {link.type}
        </Badge>
      </td>
      <td className="px-4 py-2.5">
        <code className="font-mono text-[11px] text-muted-foreground">{link.pathPattern}</code>
      </td>
      <td className="px-4 py-2.5">
        <code className="font-mono text-[11px] text-foreground/90">{link.examplePath}</code>
      </td>
      <td className="hidden px-4 py-2.5 lg:table-cell">
        <code className="block truncate font-mono text-[11px] text-muted-foreground">
          {link.schemeUrl ?? "—"}
        </code>
      </td>
      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
        <CopyButton value={copyValue} />
      </td>
    </tr>
  );
}
