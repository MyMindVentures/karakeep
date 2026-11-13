import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const route = read("apps/web/app/api/lifeos-graph/bookmarks/route.ts");
const page = read("apps/web/app/dashboard/bookmarks/page.tsx");
const view = read("apps/web/components/dashboard/bookmarks/LifeOSGraphBookmarks.tsx");
const trpc = read("packages/trpc/index.ts");

test("Graph mode is disabled by default and native route is used, not an iframe", () => {
  assert.match(route, /LIFEOS_GRAPH_MODE_ENABLED !== "true"/);
  assert.match(page, /LIFEOS_GRAPH_MODE_ENABLED === "true"/);
  assert.match(page, /LifeOSGraphBookmarks/);
  assert.doesNotMatch(page, /iframe/);
});

test("Native bridge uses only the logged-in Karakeep OIDC owner's token", () => {
  for (const re of [
    /getServerAuthSession\(\)/, /accounts\.userId/, /accounts\.providerId, "custom"/,
    /account\.accessTokenExpiresAt/, /Authorization: "Bearer " \+ account\.accessToken/,
    /LIFEOS_GRAPH_ORIGIN/, /"https:"/, /redirect: "error"/,
    /AbortSignal\.timeout\(10_000\)/, /GRAPH_UPSTREAM_UNAVAILABLE/
  ]) assert.match(route, re);
  assert.doesNotMatch(route, /SUPABASE_SECRET_KEY|service_role|localStorage|window\.location/);
});

test("Native bridge permits Graph-only CRUD and disallows cross-origin writes", () => {
  assert.match(route, /CSRF_DENIED/);
  assert.match(route, /request\.headers\.get\("origin"\)/);
  assert.match(route, /"POST"/);
  assert.match(route, /"GRAPH_REQUEST_DENIED"/);
  assert.doesNotMatch(route, /\.from\("bookmarks"\)|\.insert\(bookmarks|\.delete\(bookmarks/);
});

test("Visible Karakeep bookmarks are sourced from Graph and real edge codes", () => {
  assert.match(view, /\/api\/lifeos-graph\/bookmarks/);
  assert.match(view, /relationCode/);
  assert.match(view, /groupId/);
  assert.match(view, /crypto\.randomUUID\(\)/);
  assert.match(view, /method: "POST"/);
  assert.doesNotMatch(view, /setInterval|cron\.|KARAKEEP_API_KEY|SUPABASE_SERVICE_ROLE|iframe/);
});

test("Graph mode rejects legacy SQLite bookmark/tag/list mutations rather than dual-writing", () => {
  assert.match(trpc, /rejectLegacyBookmarkWritesInGraphMode/);
  assert.match(trpc, /LIFEOS_GRAPH_MODE_ENABLED === "true"/);
  assert.match(trpc, /bookmarks\|tags\|lists/);
  assert.match(trpc, /Canonical bookmark data is managed by Life OS Graph/);
});

test("native Graph view contains no escaped-newline source corruption", () => {
  assert.doesNotMatch(view, /\\\\n/);
  assert.match(view, /\[showArchived\]/);
  assert.match(view, /\[showArchived\]\);/);
  assert.match(view, /status=/);
});
test("native Graph edits remain reversible and project writes stay review-gated", () => {
  assert.match(view, /method: "PATCH"/);
  assert.match(view, /"rename" \| "archive" \| "restore"/);
  assert.match(view, /<select disabled aria-disabled="true"/);
  assert.doesNotMatch(view, /\{ groupId \}|\{\.\.\.\(groupId/);
});
