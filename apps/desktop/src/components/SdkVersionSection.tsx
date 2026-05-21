import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@hangar/ui";
import { getExpoSdkStatus, getExpoSdkUpgradeCommand } from "@hangar/core";
import { useAppStore } from "@/lib/store";
import { AlertTriangle, Package } from "lucide-react";

export function SdkVersionSection() {
  const scanResult = useAppStore((s) => s.scanResult);
  const sdkStatus = useMemo(
    () => getExpoSdkStatus(scanResult?.sdkVersion),
    [scanResult?.sdkVersion],
  );

  if (!sdkStatus.isDetected || sdkStatus.isLatest) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Package className="h-4 w-4 text-warning" />
          Expo SDK update available
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1 text-sm">
            <p className="text-foreground">
              This project is on{" "}
              <span className="font-medium">Expo SDK {sdkStatus.currentMajor}</span>
              {sdkStatus.sdkVersion ? ` (expo@${sdkStatus.sdkVersion})` : ""}. The latest stable
              release is{" "}
              <span className="font-medium">SDK {sdkStatus.latestMajor}</span>.
            </p>
            <p className="text-xs text-muted-foreground">
              Upgrade to get the latest React Native, security fixes, and Expo features before
              shipping.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 font-mono text-[11px] text-muted-foreground">
          {getExpoSdkUpgradeCommand(sdkStatus.latestMajor)} --fix
        </div>
      </CardContent>
    </Card>
  );
}
