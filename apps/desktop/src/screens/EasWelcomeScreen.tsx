import { LogIn, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@expopilot/ui";
import { useAppStore } from "@/lib/store";
import { EAS_LOGIN_STEPS, easAuthDescription, easAuthTitle } from "@/lib/eas-auth";

export function EasWelcomeScreen() {
  const easAuth = useAppStore((s) => s.easAuth);
  const isCheckingEasAuth = useAppStore((s) => s.isCheckingEasAuth);
  const checkEasAuth = useAppStore((s) => s.checkEasAuth);

  const status = easAuth?.state ?? "not-logged-in";
  const title = easAuthTitle(status);
  const description = easAuthDescription(status);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(245,158,11,0.1),transparent)]"
      />

      <div className="relative w-full max-w-[680px]">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 shadow-[0_0_24px_rgba(245,158,11,0.12)]">
            <LogIn className="h-5 w-5 text-warning" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mx-auto mt-2 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </header>

        <section className="rounded-2xl border border-border/80 bg-card/50 px-6 py-7 sm:px-8">
          <div className="mb-5 flex items-center gap-2 text-sm font-medium text-foreground">
            <Terminal className="h-4 w-4 text-warning" />
            Run these commands in your terminal
          </div>

          <ol className="space-y-4">
            {EAS_LOGIN_STEPS.map((step, index) => (
              <li key={step.command} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/15 text-xs font-semibold text-warning">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-[#0d0d12] px-3 py-2 font-mono text-xs text-foreground">
                    {step.command}
                  </pre>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col items-center gap-2 border-t border-border/60 pt-6 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="h-10 min-w-[180px] px-6 text-sm font-medium"
              onClick={() => checkEasAuth()}
              disabled={isCheckingEasAuth}
            >
              <RefreshCw className={`h-4 w-4 ${isCheckingEasAuth ? "animate-spin" : ""}`} />
              {isCheckingEasAuth ? "Checking login…" : "I've signed - check again"}
            </Button>
            <p className="text-center text-xs text-muted-foreground sm:text-left">
              ExpoPilot will continue once EAS login is detected.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
