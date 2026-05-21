import { describe, it, expect, beforeEach } from "vitest";
import {
  basename,
  calculateHealthScore,
  createIssue,
  detectStagingUrl,
  getPackageVersion,
  joinPath,
  parseJsonSafe,
  resetIssueCounter,
  severityWeight,
} from "./helpers.js";

describe("calculateHealthScore", () => {
  it("returns 100 when there are no actionable issues", () => {
    expect(calculateHealthScore([])).toBe(100);
    expect(
      calculateHealthScore([
        { id: "1", severity: "passed", category: "x", title: "y", description: "z" },
      ]),
    ).toBe(100);
  });

  it("subtracts 15 per critical, 5 per warning, 2 per info", () => {
    const score = calculateHealthScore([
      { id: "1", severity: "critical", category: "x", title: "a", description: "" },
      { id: "2", severity: "warning", category: "x", title: "b", description: "" },
      { id: "3", severity: "info", category: "x", title: "c", description: "" },
    ]);
    // 100 - 15 - 5 - 2 = 78
    expect(score).toBe(78);
  });

  it("clamps to [0, 100]", () => {
    const manyCriticals = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      severity: "critical" as const,
      category: "x",
      title: "t",
      description: "",
    }));
    expect(calculateHealthScore(manyCriticals)).toBe(0);
  });

  it("rewards passed checks (capped at +10)", () => {
    const issues = [
      { id: "1", severity: "warning" as const, category: "x", title: "a", description: "" },
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `p${i}`,
        severity: "passed" as const,
        category: "x",
        title: "p",
        description: "",
      })),
    ];
    // 100 - 5 + min(30*0.5, 10) = 105 → clamp 100
    expect(calculateHealthScore(issues)).toBe(100);
  });
});

describe("createIssue", () => {
  beforeEach(() => resetIssueCounter());

  it("auto-assigns sequential ids", () => {
    const a = createIssue({ severity: "info", category: "x", title: "a", description: "" });
    const b = createIssue({ severity: "info", category: "x", title: "b", description: "" });
    expect(a.id).toBe("issue-1");
    expect(b.id).toBe("issue-2");
  });

  it("honors an explicit id", () => {
    const issue = createIssue({
      id: "custom",
      severity: "info",
      category: "x",
      title: "a",
      description: "",
    });
    expect(issue.id).toBe("custom");
  });
});

describe("severityWeight", () => {
  it("orders by severity (lower = worse)", () => {
    expect(severityWeight("critical")).toBeLessThan(severityWeight("warning"));
    expect(severityWeight("warning")).toBeLessThan(severityWeight("info"));
    expect(severityWeight("info")).toBeLessThan(severityWeight("passed"));
  });
});

describe("joinPath", () => {
  it("joins with a single separator", () => {
    expect(joinPath("a", "b", "c")).toBe("a/b/c");
  });

  it("collapses duplicate slashes", () => {
    expect(joinPath("a/", "/b/", "/c")).toBe("a/b/c");
    expect(joinPath("/root//", "//sub")).toBe("/root/sub");
  });

  it("strips trailing slashes", () => {
    expect(joinPath("a", "b/")).toBe("a/b");
  });
});

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("/a/b/c.txt")).toBe("c.txt");
    expect(basename("file")).toBe("file");
    expect(basename("dir/")).toBe("");
  });
});

describe("parseJsonSafe", () => {
  it("returns parsed value on success", () => {
    expect(parseJsonSafe<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null on parse error", () => {
    expect(parseJsonSafe("not json")).toBeNull();
  });
});

describe("getPackageVersion", () => {
  it("strips range prefixes", () => {
    expect(getPackageVersion({ expo: "^54.0.0" }, "expo")).toBe("54.0.0");
    expect(getPackageVersion({ react: "~19.1.0" }, "react")).toBe("19.1.0");
    expect(getPackageVersion({ a: ">=1.0.0" }, "a")).toBe("1.0.0");
  });

  it("returns undefined when missing", () => {
    expect(getPackageVersion({}, "expo")).toBeUndefined();
    expect(getPackageVersion(undefined, "expo")).toBeUndefined();
  });
});

describe("detectStagingUrl", () => {
  it.each([
    "http://localhost:3000",
    "https://127.0.0.1/api",
    "https://staging.example.com",
    "https://dev.example.com",
    "https://sandbox.example.com",
    "https://something.local/api",
    "https://abc.ngrok.io",
  ])("flags %s", (url) => {
    expect(detectStagingUrl(url)).toBe(true);
  });

  it("ignores production URLs", () => {
    expect(detectStagingUrl("https://api.example.com")).toBe(false);
  });
});
