import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  /** Reset the boundary when this value changes (e.g. activeScreen). */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the devtools console - Tauri webview still hooks console.error.
    console.error("[ExpoPilot] Render error:", error, info.componentStack);
  }

  private handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="text-sm font-semibold">Something went wrong on this screen</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            ExpoPilot caught a crash while rendering. Your project data is safe - only this
            screen failed. Try refreshing or navigating elsewhere.
          </p>
          <pre className="max-h-40 overflow-auto rounded-md bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
