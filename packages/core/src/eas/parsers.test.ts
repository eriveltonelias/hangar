import { describe, it, expect, vi, afterEach } from "vitest";
import { parseEasJson, relativeTime } from "./parsers.js";

describe("parseEasJson", () => {
  it("parses raw JSON", () => {
    const obj = parseEasJson<{ a: number }>('{"a":1}');
    expect(obj).toEqual({ a: 1 });
  });

  it("parses JSON when prefixed with EAS warning chatter", () => {
    // parseJsonOutput tolerates lines before the JSON payload
    const noisy = `Warning: experimental flag enabled\n{"profiles":{"production":{}}}`;
    const obj = parseEasJson<{ profiles: Record<string, unknown> }>(noisy);
    expect(obj.profiles).toBeDefined();
  });
});

describe("relativeTime", () => {
  afterEach(() => vi.useRealTimers());

  it("formats seconds-ago as 'just now'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(relativeTime("2026-01-01T11:59:30Z")).toBe("just now");
  });

  it("formats minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(relativeTime("2026-01-01T11:55:00Z")).toBe("5m ago");
  });

  it("formats hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(relativeTime("2026-01-01T09:00:00Z")).toBe("3h ago");
  });

  it("formats days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00Z"));
    expect(relativeTime("2026-01-08T12:00:00Z")).toBe("2d ago");
  });
});
