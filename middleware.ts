import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, getAuthConfig, isAuthRequired, readSessionToken } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isAuthRequired() && !PUBLIC_PATHS.has(pathname)) {
    const config = getAuthConfig();
    if (!config) {
      return new NextResponse(
        "Login is not configured. Set AUTH_USERS and AUTH_SECRET (32+ characters).",
        { status: 503, headers: { "content-type": "text/plain" } }
      );
    }

    const user = await readSessionToken(config, request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", pathname + search);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === "/week" || pathname === "/plan") {
    const url = request.nextUrl.clone();
    url.pathname = "/menu";
    return NextResponse.rewrite(url);
  }

  if (pathname === "/junk") {
    const url = request.nextUrl.clone();
    url.pathname = "/menu";
    if (!url.searchParams.has("type")) {
      url.searchParams.set("type", "Junk");
    }
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except build assets and the public icons/manifest/service worker.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-touch-icon\\.png|icons/|sw\\.js|manifest\\.webmanifest).*)",
  ],
};
