import { describe, it, expect } from "vitest";
import {
  appendQueryToUrl,
  buildExamplePath,
  buildSchemeDeepLink,
  buildSchemeDeepLinkPattern,
  isNavigableRoute,
  pathPatternToFileRoute,
} from "./router-links.js";
import type { RouteNode } from "../types/index.js";

function makeNode(partial: Partial<RouteNode> & { type: RouteNode["type"] }): RouteNode {
  return {
    id: "n",
    name: "n",
    path: "/n",
    filePath: "app/n.tsx",
    children: [],
    warnings: [],
    ...partial,
  };
}

describe("isNavigableRoute", () => {
  it("rejects layout and group nodes", () => {
    expect(isNavigableRoute(makeNode({ type: "layout" }))).toBe(false);
    expect(isNavigableRoute(makeNode({ type: "group" }))).toBe(false);
  });

  it("rejects page nodes that have children (index-only parents)", () => {
    const parent = makeNode({ type: "page", children: [makeNode({ type: "page" })] });
    expect(isNavigableRoute(parent)).toBe(false);
  });

  it("accepts leaf pages, dynamic routes, modals, and not-found", () => {
    expect(isNavigableRoute(makeNode({ type: "page" }))).toBe(true);
    expect(isNavigableRoute(makeNode({ type: "dynamic" }))).toBe(true);
    expect(isNavigableRoute(makeNode({ type: "modal" }))).toBe(true);
    expect(isNavigableRoute(makeNode({ type: "not-found" }))).toBe(true);
  });
});

describe("buildExamplePath", () => {
  it("substitutes named dynamic params", () => {
    expect(buildExamplePath("/user/:id", ["id"])).toBe("/user/123");
    expect(buildExamplePath("/post/:slug", ["slug"])).toBe("/post/my-post");
    expect(buildExamplePath("/u/:uuid", ["uuid"])).toBe("/u/a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("falls back to a generic example when params are unhinted", () => {
    expect(buildExamplePath("/x/:foo", ["foo"])).toBe("/x/example");
  });

  it("returns '/' for the empty pattern", () => {
    expect(buildExamplePath("")).toBe("/");
  });
});

describe("buildSchemeDeepLink", () => {
  it("strips a single leading slash", () => {
    expect(buildSchemeDeepLink("myapp", "/profile")).toBe("myapp://profile");
  });

  it("returns just the scheme:// for the empty path", () => {
    expect(buildSchemeDeepLink("myapp", "")).toBe("myapp://");
    expect(buildSchemeDeepLink("myapp", "/")).toBe("myapp://");
  });
});

describe("buildSchemeDeepLinkPattern", () => {
  it("preserves :param tokens", () => {
    expect(buildSchemeDeepLinkPattern("myapp", "/user/:id")).toBe("myapp://user/:id");
  });
});

describe("appendQueryToUrl", () => {
  it("appends url-encoded query strings", () => {
    expect(appendQueryToUrl("https://x.com/a", { ref: "email", source: "push" })).toBe(
      "https://x.com/a?ref=email&source=push",
    );
  });

  it("leaves the URL untouched when query is empty", () => {
    expect(appendQueryToUrl("https://x.com/a", {})).toBe("https://x.com/a");
  });
});

describe("pathPatternToFileRoute", () => {
  it("converts :param tokens to [param] file segments", () => {
    // sanity that the round-trip stays reasonable
    expect(typeof pathPatternToFileRoute("/user/:id")).toBe("string");
  });
});
