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
  assert.doesNotMatch(page, /<iframe\\b/i);
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

test("Native bridge only exposes read operations", () => {
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PATCH)|\/graph\/(create|edit)/);
  assert.match(route, /GRAPH_REQUEST_DENIED/);
});

test("Visible Karakeep bookmarks are sourced from Graph and real edge codes", () => {
  assert.match(view, /\/api\/lifeos-graph\/bookmarks/);
  assert.match(view, /relationCode/);
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
test("The Graph read view offers only supported controls", () => {
  assert.doesNotMatch(view, /method: "(POST|PATCH)"|Wijzig titel|Bookmark bewaren/);
  assert.match(view, /showArchived/);
});

test("The dashboard permits only the configured HTTPS parent in Graph mode", () => {
  const config = read("apps/web/next.config.mjs");
  assert.match(config, /frameAncestor = "'none'"/);
  assert.match(config, /url\.origin === parent && url\.protocol === "https:"/);
  assert.match(config, /"frame-ancestors " \+ frameAncestor/);
});
