import { Loader2 } from "lucide-react";
import { WelcomeScreen } from "@/screens/WelcomeScreen";
import { EasWelcomeScreen } from "@/screens/EasWelcomeScreen";
import { useAppStore } from "@/lib/store";
import { isTauri } from "@/lib/platform";

function EasAuthCheckingScreen() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(59,130,246,0.12),transparent)]"
      />
      <div className="relative flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">Checking EAS login…</p>
        <p className="text-xs text-muted-foreground">Verifying your Expo account via the CLI</p>
      </div>
    </div>
  );
}

export function NoProjectsOnboarding() {
  const easAuth = useAppStore((s) => s.easAuth);
  const isCheckingEasAuth = useAppStore((s) => s.isCheckingEasAuth);

  if (isTauri() && (easAuth === null || isCheckingEasAuth)) {
    return <EasAuthCheckingScreen />;
  }

  if (isTauri() && easAuth && easAuth.state !== "logged-in") {
    return <EasWelcomeScreen />;
  }

  return <WelcomeScreen />;
}
