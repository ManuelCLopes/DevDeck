import test from "node:test";
import assert from "node:assert/strict";
import { buildAppRoute, buildDesktopNavigationUrl } from "./app-navigation";

test("buildAppRoute avoids duplicating inline and explicit search params", () => {
  assert.equal(
    buildAppRoute("/?project=alpha", "?project=alpha"),
    "/?project=alpha",
  );
  assert.equal(buildAppRoute("/reviews", "?pr=42"), "/reviews?pr=42");
});

test("buildDesktopNavigationUrl clears stale search when target has no query", () => {
  assert.equal(
    buildDesktopNavigationUrl("https://example.com/?project=alpha#/", "/reviews"),
    "https://example.com/#/reviews",
  );
});

test("buildDesktopNavigationUrl preserves the target query for project routes", () => {
  assert.equal(
    buildDesktopNavigationUrl("https://example.com/#/reviews", "/?project=alpha"),
    "https://example.com/?project=alpha#/",
  );
});
