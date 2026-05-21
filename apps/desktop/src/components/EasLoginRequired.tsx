import { Card, CardContent, CardHeader, CardTitle, Button } from "@hangar/ui";
import { Terminal, RefreshCw, LogIn } from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  EAS_LOGIN_STEPS,
  easAuthDescription,
  easAuthTitle,
} from "@/lib/eas-auth";

interface EasLoginRequiredProps {
  variant?: "banner" | "card";
}

export function EasLoginRequired({ variant = "card" }: EasLoginRequiredProps) {
  const easAuth = useAppStore((s) => s.easAuth);
  const isCheckingEasAuth = useAppStore((s) => s.isCheckingEasAuth);
  const checkEasAuth = useAppStore((s) => s.checkEasAuth);
  const loadEasData = useAppStore((s) => s.loadEasData);

  if (!easAuth || easAuth.state === "logged-in" || easAuth.state === "unavailable") {
    return null;
  }

  const handleCheckAgain = async () => {
    const status = await checkEasAuth();
    if (status.state === "logged-in") {
      await loadEasData();
    }
  };

  const title = easAuthTitle(easAuth.state);
  const description = easAuthDescription(easAuth.state);

  if (variant === "banner") {
    return (
      <div className="border-b border-warning/30 bg-warning/10 px-6 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <LogIn className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-warning">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              <p className="mt-2 font-mono text-xs text-foreground">
                npm install -g eas-cli && eas login && eas whoami
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckAgain}
            disabled={isCheckingEasAuth}
            className="shrink-0"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isCheckingEasAuth ? "animate-spin" : ""}`} />
            Check again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-4 w-4 text-warning" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>

        <ol className="space-y-4">
          {EAS_LOGIN_STEPS.map((step, index) => (
            <li key={step.command} className="space-y-1.5">
              <p className="text-sm font-medium">
                {index + 1}. {step.title}
              </p>
              <p className="text-xs text-muted-foreground">{step.description}</p>
              <pre className="overflow-x-auto rounded-lg border border-border bg-[#0d0d12] px-3 py-2 font-mono text-xs text-foreground">
                {step.command}
              </pre>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-3 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckAgain}
            disabled={isCheckingEasAuth}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isCheckingEasAuth ? "animate-spin" : ""}`} />
            {isCheckingEasAuth ? "Checking…" : "Check again"}
          </Button>
          <p className="text-xs text-muted-foreground">
            After logging in, click Check again to reload EAS data.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
