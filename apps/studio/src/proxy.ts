import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidToken } from "@/lib/local-token";

export function proxy(request: NextRequest) {
  if (isValidToken(request.cookies.get("igor_token")?.value)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
