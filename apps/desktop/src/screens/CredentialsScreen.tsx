import { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from "@hangar/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { CredentialsHealthStatus, MobileProvisionInfo } from "@hangar/core";
import { useAppStore } from "@/lib/store";
import { EmptyProject } from "@/components/shared";
import { isTauri } from "@/lib/platform";
import { openInEditorWithFeedback } from "@/lib/file-actions";

const STATUS_STYLES: Record<
  CredentialsHealthStatus,
  { label: string; badge: "destructive" | "warning" | "secondary" | "success"; icon: typeof CheckCircle2 }
> = {
  expired: { label: "Expired", badge: "destructive", icon: XCircle },
  critical: { label: "Expires soon", badge: "destructive", icon: AlertTriangle },
  warning: { label: "Renew soon", badge: "warning", icon: AlertTriangle },
  ok: { label: "Healthy", badge: "success", icon: CheckCircle2 },
  unknown: { label: "Unknown", badge: "secondary", icon: ShieldCheck },
};

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function describeDays(days?: number): string {
  if (days === undefined) return "expiry unknown";
  if (days <= 0) return `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

export function CredentialsScreen() {
  const projectPath = useAppStore((s) => s.projectPath);
  const credentials = useAppStore((s) => s.credentials);
  const isScanning = useAppStore((s) => s.isScanningCredentials);
  const scanCredentials = useAppStore((s) => s.scanCredentials);
  const settings = useAppStore((s) => s.settings);

  useEffect(() => {
    if (projectPath && !credentials && !isScanning) {
      void scanCredentials();
    }
  }, [projectPath, credentials, isScanning, scanCredentials]);

  if (!projectPath) return <EmptyProject />;

  const profiles = credentials?.provisioningProfiles ?? [];
  const sortedProfiles = [...profiles].sort(
    (a, b) => (a.daysUntilExpiry ?? 9_999) - (b.daysUntilExpiry ?? 9_999),
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Credentials</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signing certificates, provisioning profiles, and keystores that ship your app.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void scanCredentials()} disabled={isScanning}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
          Rescan
        </Button>
      </header>

      <SummaryStrip />

      {credentials?.managedByEas && <ManagedByEasNotice />}

      {sortedProfiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provisioning profiles</CardTitle>
            <CardDescription>
              iOS provisioning profiles found in this project. Apple-signed expiry is read from each
              file&apos;s embedded plist.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            {sortedProfiles.map((profile) => (
              <ProfileRow
                key={profile.filePath}
                profile={profile}
                onOpen={() => void openInEditorWithFeedback(profile.filePath, settings.preferredEditor)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {(credentials?.keystores.length ?? 0) + (credentials?.iosCertificates.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other credential files</CardTitle>
            <CardDescription>
              Files we can&apos;t parse without OS-level tools (openssl, keytool). Their presence is
              tracked but expiry isn&apos;t shown here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {credentials?.keystores.length ? (
              <FileGroup
                icon={KeyRound}
                label="Android keystores"
                paths={credentials.keystores}
                onOpen={(p) => void openInEditorWithFeedback(p, settings.preferredEditor)}
              />
            ) : null}
            {credentials?.iosCertificates.length ? (
              <FileGroup
                icon={ShieldCheck}
                label="iOS certificates / keys"
                paths={credentials.iosCertificates}
                onOpen={(p) => void openInEditorWithFeedback(p, settings.preferredEditor)}
              />
            ) : null}
          </CardContent>
        </Card>
      )}

      {credentials?.hasCredentialsJson && credentials.credentialsJson && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">credentials.json</CardTitle>
            <CardDescription>{credentials.credentialsJson.filePath}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="max-h-[320px] overflow-auto bg-[#0a0a0f] p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(credentials.credentialsJson.raw, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryStrip() {
  const credentials = useAppStore((s) => s.credentials);
  const isScanning = useAppStore((s) => s.isScanningCredentials);

  const worstStatus: CredentialsHealthStatus = credentials?.worstStatus ?? "unknown";
  const style = STATUS_STYLES[worstStatus];
  const Icon = style.icon;
  const totals = {
    profiles: credentials?.provisioningProfiles.length ?? 0,
    expired: credentials?.provisioningProfiles.filter((p) => p.expirationStatus === "expired").length ?? 0,
    critical: credentials?.provisioningProfiles.filter((p) => p.expirationStatus === "critical").length ?? 0,
    warning: credentials?.provisioningProfiles.filter((p) => p.expirationStatus === "warning").length ?? 0,
  };

  if (!credentials && !isScanning) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div
        className={`flex items-center gap-3 rounded-xl border p-4 ${
          worstStatus === "ok"
            ? "border-success/30 bg-success/10"
            : worstStatus === "expired" || worstStatus === "critical"
              ? "border-destructive/30 bg-destructive/10"
              : worstStatus === "warning"
                ? "border-warning/30 bg-warning/10"
                : "border-border bg-card"
        }`}
      >
        <Icon
          className={`h-5 w-5 shrink-0 ${
            worstStatus === "ok"
              ? "text-success"
              : worstStatus === "expired" || worstStatus === "critical"
                ? "text-destructive"
                : worstStatus === "warning"
                  ? "text-warning"
                  : "text-muted-foreground"
          }`}
        />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Overall
          </p>
          <p className="text-sm font-semibold">{style.label}</p>
        </div>
      </div>
      <Stat label="Profiles found" value={totals.profiles} />
      <Stat label="Expired or critical" value={totals.expired + totals.critical} tone={totals.expired + totals.critical > 0 ? "destructive" : "muted"} />
      <Stat label="Renew within 30 days" value={totals.warning} tone={totals.warning > 0 ? "warning" : "muted"} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "destructive" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ProfileRow({
  profile,
  onOpen,
}: {
  profile: MobileProvisionInfo;
  onOpen: () => void;
}) {
  const style = STATUS_STYLES[profile.expirationStatus];
  const Icon = style.icon;
  return (
    <div
      className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 ${
        profile.expirationStatus === "expired" || profile.expirationStatus === "critical"
          ? "border-destructive/30 bg-destructive/[0.04]"
          : profile.expirationStatus === "warning"
            ? "border-warning/30 bg-warning/[0.04]"
            : "border-border"
      }`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          profile.expirationStatus === "expired" || profile.expirationStatus === "critical"
            ? "text-destructive"
            : profile.expirationStatus === "warning"
              ? "text-warning"
              : profile.expirationStatus === "ok"
                ? "text-success"
                : "text-muted-foreground"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{profile.name ?? fileName(profile.filePath)}</p>
          <Badge variant={style.badge} className="font-normal">
            {describeDays(profile.daysUntilExpiry)}
          </Badge>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {profile.teamName && <>Team <span className="font-medium">{profile.teamName}</span> · </>}
          {profile.appIdName && <>App ID <span className="font-medium">{profile.appIdName}</span> · </>}
          {profile.expiresAt ? new Date(profile.expiresAt).toLocaleDateString() : "no expiry recorded"}
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
        >
          {profile.filePath}
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function FileGroup({
  icon: Icon,
  label,
  paths,
  onOpen,
}: {
  icon: typeof KeyRound;
  label: string;
  paths: string[];
  onOpen: (p: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">{label}</p>
        <Badge variant="secondary" className="font-normal">
          {paths.length}
        </Badge>
      </div>
      <ul className="space-y-1">
        {paths.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onOpen(p)}
              className="flex w-full items-center gap-1 truncate text-left font-mono text-[11px] text-primary hover:underline"
            >
              {p}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManagedByEasNotice() {
  return (
    <Card className="border-primary/30 bg-primary/[0.04]">
      <CardContent className="flex items-start gap-3 p-5">
        <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Credentials are managed by EAS</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            No local certificates, provisioning profiles, or keystores were found in this project - your
            credentials are stored in Expo&apos;s cloud, you can audit them by running{" "}
            <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[11px]">eas credentials</code>{" "}
            in your terminal.
          </p>
          {!isTauri() && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Scanning requires the desktop app.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
