import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { accounts } from "@karakeep/db/schema";
import { db } from "@karakeep/db";
import { getServerAuthSession } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (data: Record<string, unknown>, status = 200) =>
  NextResponse.json(data, {
    status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });

type GraphVerb = "GET" | "POST" | "PATCH";

function lifeOsGraphOrigin(): string | null {
  const configured = process.env.LIFEOS_GRAPH_ORIGIN;
  if (!configured || configured.length > 256) return null;
  try {
    const url = new URL(configured);
    // Restrict to an exact, administrator-pinned HTTPS origin.
    if (url.protocol !== "https:" || url.origin !== configured ||
        url.username || url.password || url.port || !url.hostname.includes(".") ||
        url.hostname === "localhost" || url.hostname.endsWith(".local") ||
        url.hostname.endsWith(".internal")) return null;
    return url.origin;
  } catch { return null; }
}

/**
 * Karakeep native server -> Life OS canonical Graph.
 *
 * The existing verified Supabase OIDC access token is taken exclusively from
 * the signed-in Karakeep user's linked OAuth account, never from a client body,
 * query, browser storage, arbitrary headers, or a shared service-role key.
 * Life OS independently checks client_id, user identity and owner RLS.
 *
 * This adapter is fail-closed and disabled unless explicitly enabled after
 * integration testing; no SQLite bookmark writes take place here.
 */
async function forward(request: NextRequest, verb: GraphVerb) {
  if (process.env.LIFEOS_GRAPH_MODE_ENABLED !== "true")
    return json({ error: "GRAPH_MODE_DISABLED" }, 404);
  const origin = lifeOsGraphOrigin();
  if (!origin) return json({ error: "GRAPH_ORIGIN_NOT_CONFIGURED" }, 503);

  const session = await getServerAuthSession();
  if (!session?.user?.id) return json({ error: "UNAUTHENTICATED" }, 401);

  if (verb !== "GET") {
    const allowedOrigin = new URL(request.url).origin;
    if (request.headers.get("origin") !== allowedOrigin ||
        request.headers.get("sec-fetch-site") === "cross-site")
      return json({ error: "CSRF_DENIED" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ error: "JSON_REQUIRED" }, 415);
  }

  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, session.user.id), eq(accounts.providerId, "custom")),
    columns: { accessToken: true, accessTokenExpiresAt: true },
  });
  if (!account?.accessToken ||
      (account.accessTokenExpiresAt && account.accessTokenExpiresAt.getTime() <= Date.now() + 30_000))
    return json({ error: "OIDC_REAUTH_REQUIRED" }, 401);

  // Do not accept an upstream destination, bearer token, identity, or owner
  // override from browser input. Only bounded, validated query parameters.
  const groups = verb === "GET" && request.nextUrl.searchParams.get("kind") === "groups";
  const target = new URL(verb === "PATCH"
    ? "/api/integrations/karakeep/graph/edit"
    : verb === "POST" ? "/api/integrations/karakeep/graph/create"
    : groups ? "/api/integrations/karakeep/graph/groups"
      : "/api/integrations/karakeep/graph", origin);
  let body: string | undefined;
  if (verb === "GET" && !groups) {
    const page = request.nextUrl.searchParams.get("page") ?? "0";
    if (!/^(0|[1-9][0-9]{0,2})$/.test(page) || Number(page) > 999)
      return json({ error: "INVALID_PAGE" }, 400);
    target.searchParams.set("page", page);
  } else {
    const raw = await request.text();
    if (raw.length > 8_192) return json({ error: "BODY_TOO_LARGE" }, 413);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return json({ error: "INVALID_BODY" }, 400);
    } catch { return json({ error: "INVALID_JSON" }, 400); }
    body = raw;
  }
  try {
    const upstream = await fetch(target, {
      method: verb,
      headers: {
        Authorization: "Bearer " + account.accessToken,
        Accept: "application/json",
        ...(verb !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    // No token, headers, or opaque upstream errors are returned to the browser.
    const payload: unknown = await upstream.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return json({ error: "INVALID_GRAPH_RESPONSE" }, 502);
    if (!upstream.ok) return json({ error: "GRAPH_REQUEST_DENIED", status: upstream.status }, upstream.status >= 500 ? 502 : upstream.status);
    return json(payload as Record<string, unknown>, upstream.status);
  } catch {
    return json({ error: "GRAPH_UPSTREAM_UNAVAILABLE" }, 502);
  }
}

export async function GET(request: NextRequest) { return forward(request, "GET"); }
export async function POST(request: NextRequest) { return forward(request, "POST"); }

export async function PATCH(request: NextRequest) { return forward(request, "PATCH"); }
