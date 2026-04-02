import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getExpectedAuthToken } from "./lib/auth";

function isPublicPath(pathname) {
  return pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout";
}

function isStaticAsset(pathname) {
  return pathname.startsWith("/_next") || pathname === "/favicon.ico" || /\.[a-zA-Z0-9]+$/.test(pathname);
}

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const expectedToken = await getExpectedAuthToken();
  if (!expectedToken) {
    if (pathname.startsWith("/api/") && !isPublicPath(pathname)) {
      return NextResponse.json({ error: "Server auth is not configured." }, { status: 500 });
    }
    if (pathname !== "/login") {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "config");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value || "";
  if (token === expectedToken) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/:path*"]
};
