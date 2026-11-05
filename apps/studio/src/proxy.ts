import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidToken } from "@/lib/local-token";

export function proxy(request: NextRequest) {
  if (isValidToken(request.cookies.get("igor_token")?.value)) {
    return NextResponse.next();
  }

  // Agents (the MCP server, scripts) send the same token as a bearer header.
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && isValidToken(auth.slice(7).trim())) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Yetkisiz: igor_token çerezi ya da Bearer token gerekli" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
