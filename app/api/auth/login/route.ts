import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  getAuthConfig,
  safeNextPath,
  sessionCookieOptions,
  verifyCredentials,
} from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(form.get("next"));

  const config = getAuthConfig();
  const user = config ? await verifyCredentials(config, username, password) : null;

  if (!config || !user) {
    // Small delay to slow down password guessing.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const retry = new URL("/login", request.url);
    retry.searchParams.set("error", config ? "invalid" : "config");
    retry.searchParams.set("next", next);
    return NextResponse.redirect(retry, 303);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(SESSION_COOKIE, await createSessionToken(config, user), sessionCookieOptions());
  return response;
}
