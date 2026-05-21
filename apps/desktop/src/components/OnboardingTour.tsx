import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { TOUR_STEPS } from "@/lib/onboarding";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const GAP = 12;
const TOOLTIP_WIDTH = 380;

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function tooltipPosition(
  rect: Rect | null,
  placement: "top" | "bottom" | "left" | "right",
  tooltipHeight: number,
): { top: number; left: number; centered: boolean } {
  if (!rect) {
    return {
      top: Math.max(40, window.innerHeight / 2 - tooltipHeight / 2),
      left: window.innerWidth / 2 - TOOLTIP_WIDTH / 2,
      centered: true,
    };
  }

  let top = 0;
  let left = 0;
  switch (placement) {
    case "bottom":
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case "top":
      top = rect.top - tooltipHeight - GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case "right":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left + rect.width + GAP;
      break;
    case "left":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - TOOLTIP_WIDTH - GAP;
      break;
  }

  // Clamp inside viewport
  left = Math.max(16, Math.min(window.innerWidth - TOOLTIP_WIDTH - 16, left));
  top = Math.max(16, Math.min(window.innerHeight - tooltipHeight - 16, top));
  return { top, left, centered: false };
}

export function OnboardingTour() {
  const active = useAppStore((s) => s.tourActive);
  const stepIndex = useAppStore((s) => s.tourStepIndex);
  const next = useAppStore((s) => s.nextTourStep);
  const prev = useAppStore((s) => s.prevTourStep);
  const dismiss = useAppStore((s) => s.dismissTour);
  const activeScreen = useAppStore((s) => s.activeScreen);

  const [rect, setRect] = useState<Rect | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(180);
  const step = active ? TOUR_STEPS[stepIndex] : undefined;

  // Resolve target rect - re-run on step change, screen change, and resize.
  useLayoutEffect(() => {
    if (!active || !step) {
      setRect(null);
      return;
    }
    let raf = 0;
    const findTarget = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target);
      if (!el) {
        // Element not yet mounted (e.g. screen just switched). Retry briefly.
        raf = requestAnimationFrame(findTarget);
        return;
      }
      // Bring target into view before measuring.
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      setRect(rectOf(el));
    };
    findTarget();

    const onResize = () => {
      if (!step.target) return;
      const el = document.querySelector(step.target);
      if (el) setRect(rectOf(el));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, step, activeScreen]);

  // Keyboard nav.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" && stepIndex > 0) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stepIndex, next, prev, dismiss]);

  if (!active || !step) return null;

  const pos = tooltipPosition(rect, step.placement ?? "bottom", tooltipHeight);
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {/* Dimming overlay with a punch-out for the target. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-spotlight">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PADDING}
                y={rect.top - PADDING}
                width={rect.width + PADDING * 2}
                height={rect.height + PADDING * 2}
                rx={12}
                ry={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-spotlight)"
        />
        {rect && (
          <rect
            x={rect.left - PADDING}
            y={rect.top - PADDING}
            width={rect.width + PADDING * 2}
            height={rect.height + PADDING * 2}
            rx={12}
            ry={12}
            fill="none"
            stroke="rgb(96 165 250)"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Click anywhere on the dim layer to dismiss. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Skip onboarding"
        className="pointer-events-auto absolute inset-0 cursor-default"
      />

      <div
        ref={(el) => {
          if (el) {
            const h = el.getBoundingClientRect().height;
            if (Math.abs(h - tooltipHeight) > 1) setTooltipHeight(h);
          }
        }}
        style={{
          position: "absolute",
          top: pos.top,
          left: pos.left,
          width: TOOLTIP_WIDTH,
        }}
        className="pointer-events-auto rounded-xl border border-border bg-card p-5 shadow-2xl"
        role="dialog"
        aria-labelledby="tour-title"
      >
        <div className="flex items-start justify-between gap-3">
          <p
            id="tour-title"
            className="text-[10px] font-semibold uppercase tracking-wider text-primary"
          >
            Step {stepIndex + 1} of {TOUR_STEPS.length}
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip onboarding"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <h3 className="mt-1 text-base font-semibold leading-tight">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === stepIndex ? "bg-primary" : i < stepIndex ? "bg-primary/40" : "bg-border"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={prev}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {isLast ? "Got it" : "Next"}
              {!isLast && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
