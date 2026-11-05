import { NextResponse } from "next/server";
import { isValidToken } from "@/lib/local-token";
import { tServer } from "@/lib/i18n-server";

export async function POST(request: Request) {
  const { token } = await request.json();

  if (typeof token !== "string" || !isValidToken(token)) {
    return NextResponse.json({ error: tServer("Token yanlış") }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("igor_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
