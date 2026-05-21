import { useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { Toast, ToastVariant } from "@/lib/store/types";

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof Info; border: string; text: string }> = {
  info: { icon: Info, border: "border-border", text: "text-foreground" },
  success: { icon: CheckCircle2, border: "border-success/30", text: "text-success" },
  warning: { icon: AlertTriangle, border: "border-warning/30", text: "text-warning" },
  error: { icon: XCircle, border: "border-destructive/30", text: "text-destructive" },
  loading: { icon: Loader2, border: "border-primary/30", text: "text-primary" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useAppStore((s) => s.dismissToast);
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);
  const style = VARIANT_STYLES[toast.variant];
  const Icon = style.icon;

  useEffect(() => {
    if (toast.variant === "loading") return;
    const t = setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => clearTimeout(t);
  }, [toast.id, toast.variant, toast.durationMs, dismissToast]);

  const onAction = () => {
    if (!toast.action) return;
    const { onClick } = toast.action;
    if (typeof onClick === "string") {
      const id = onClick.replace(/^\/+/, "") || "dashboard";
      setActiveScreen(id);
    } else {
      void onClick();
    }
    dismissToast(toast.id);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex w-[360px] items-start gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur ${style.border}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.text} ${toast.variant === "loading" ? "animate-spin" : ""}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{toast.description}</p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useAppStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
