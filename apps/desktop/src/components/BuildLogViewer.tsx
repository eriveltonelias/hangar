import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  X,
} from "lucide-react";
import { cn } from "@expopilot/ui";

const MAX_RENDERED_LINES = 10_000;
const ERROR_PATTERN =
  /(^|\s)(error|fail(ed|ure)?|fatal|exception|undefined symbol|✖|❌|❯ Error)/i;

interface BuildLogViewerProps {
  text: string;
  /** className applied to the scroll container - lets the parent control sizing/bg. */
  className?: string;
}

export function BuildLogViewer({ text, className }: BuildLogViewerProps) {
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const allLines = useMemo(() => text.split("\n"), [text]);
  const truncated = allLines.length > MAX_RENDERED_LINES;
  const lines = truncated ? allLines.slice(0, MAX_RENDERED_LINES) : allLines;

  const errorLineIndexes = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (ERROR_PATTERN.test(lines[i])) out.push(i);
    }
    return out;
  }, [lines]);

  const errorLineSet = useMemo(() => new Set(errorLineIndexes), [errorLineIndexes]);

  const matchIndexes = useMemo(() => {
    if (!query) return [] as number[];
    const q = query.toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) out.push(i);
    }
    return out;
  }, [lines, query]);

  const matchSet = useMemo(() => new Set(matchIndexes), [matchIndexes]);
  const currentLine = matchIndexes.length > 0 ? matchIndexes[matchIdx % matchIndexes.length] : -1;

  const scrollToLine = useCallback((lineIdx: number, block: ScrollLogicalPosition = "nearest") => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-line="${lineIdx}"]`);
    el?.scrollIntoView({ block });
  }, []);

  useEffect(() => {
    if (currentLine >= 0) scrollToLine(currentLine, "center");
  }, [currentLine, scrollToLine]);

  // Reset match index whenever the query changes - happens via setQuery callers.
  // No effect needed; consumers call setMatchIdx(0) inline.

  const nextMatch = useCallback(() => {
    if (matchIndexes.length === 0) return;
    setMatchIdx((i) => (i + 1) % matchIndexes.length);
  }, [matchIndexes.length]);

  const prevMatch = useCallback(() => {
    if (matchIndexes.length === 0) return;
    setMatchIdx((i) => (i - 1 + matchIndexes.length) % matchIndexes.length);
  }, [matchIndexes.length]);

  const jumpToFirstError = useCallback(() => {
    if (errorLineIndexes.length === 0) return;
    scrollToLine(errorLineIndexes[0], "center");
  }, [errorLineIndexes, scrollToLine]);

  // Cmd/Ctrl-F focuses search while the viewer is mounted; ESC clears query.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) prevMatch();
      else nextMatch();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setMatchIdx(0);
      inputRef.current?.blur();
    }
  };

  const matchCounter =
    matchIndexes.length === 0
      ? query
        ? "No matches"
        : ""
      : `${(matchIdx % matchIndexes.length) + 1} / ${matchIndexes.length}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/50 px-3 py-2 text-xs">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMatchIdx(0);
          }}
          onKeyDown={onInputKey}
          placeholder="Search log (⌘F · ↵ next · ⇧↵ prev · esc clear)"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <>
            <span className="shrink-0 text-[11px] text-muted-foreground">{matchCounter}</span>
            <button
              type="button"
              onClick={prevMatch}
              disabled={matchIndexes.length === 0}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              aria-label="Previous match"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={nextMatch}
              disabled={matchIndexes.length === 0}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              aria-label="Next match"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setMatchIdx(0);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={jumpToFirstError}
          disabled={errorLineIndexes.length === 0}
          className={cn(
            "ml-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium transition-colors",
            errorLineIndexes.length === 0
              ? "opacity-40"
              : "text-destructive hover:bg-destructive/10",
          )}
        >
          <AlertCircle className="h-3 w-3" />
          {errorLineIndexes.length === 0
            ? "No errors detected"
            : `Jump to first error (${errorLineIndexes.length})`}
        </button>
      </div>

      <div
        ref={containerRef}
        className={cn(
          // Pin explicit colors here - theme tokens (text-muted-foreground / text-foreground)
          // resolve to dark shades in light mode, which become unreadable against #0a0a0f.
          "flex-1 overflow-auto bg-[#0a0a0f] py-3 font-mono text-[11px] leading-relaxed text-zinc-200",
          className,
        )}
      >
        {lines.map((line, i) => (
          <LogLine
            key={i}
            index={i}
            line={line}
            query={query}
            isError={errorLineSet.has(i)}
            isMatch={matchSet.has(i)}
            isCurrent={i === currentLine}
          />
        ))}
        {truncated && (
          <p className="px-5 py-2 text-warning">
             - log truncated at {MAX_RENDERED_LINES.toLocaleString()} lines (full log has{" "}
            {allLines.length.toLocaleString()}) —
          </p>
        )}
      </div>
    </div>
  );
}

function LogLine({
  index,
  line,
  query,
  isError,
  isMatch,
  isCurrent,
}: {
  index: number;
  line: string;
  query: string;
  isError: boolean;
  isMatch: boolean;
  isCurrent: boolean;
}) {
  return (
    <div
      data-line={index}
      className={cn(
        "whitespace-pre-wrap px-5",
        isError && "bg-red-950/40 text-red-100",
        isMatch && !isCurrent && "bg-amber-500/10 text-zinc-50",
        isCurrent && "bg-primary/30 text-zinc-50 ring-1 ring-inset ring-primary/60",
      )}
    >
      {line.length === 0 ? " " : query ? highlight(line, query) : line}
    </div>
  );
}

function highlight(line: string, query: string): ReactNode {
  if (!query) return line;
  const parts: ReactNode[] = [];
  const lower = line.toLowerCase();
  const q = query.toLowerCase();
  let cursor = 0;
  let key = 0;
  while (cursor < line.length) {
    const idx = lower.indexOf(q, cursor);
    if (idx === -1) {
      parts.push(line.slice(cursor));
      break;
    }
    if (idx > cursor) parts.push(line.slice(cursor, idx));
    parts.push(
      <mark
        key={key++}
        className="rounded bg-amber-300 px-0.5 text-zinc-900"
      >
        {line.slice(idx, idx + query.length)}
      </mark>,
    );
    cursor = idx + query.length;
  }
  return <>{parts}</>;
}
