import { NextResponse } from "next/server";

export function proxy() {
  const parent = process.env.LIFEOS_GRAPH_ORIGIN;
  let frameAncestor = "'none'";
  if (process.env.LIFEOS_GRAPH_MODE_ENABLED === "true" && parent) {
    try {
      const url = new URL(parent);
      if (url.origin === parent && url.protocol === "https:" && !url.port) {
        frameAncestor = url.origin;
      }
    } catch {
      // Invalid configuration cannot enable framing.
    }
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", "frame-ancestors " + frameAncestor);
  return response;
}

export const config = { matcher: "/dashboard/:path*" };
