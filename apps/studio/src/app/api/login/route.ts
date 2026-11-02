import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { token } = await request.json();
  const appToken = process.env.APP_TOKEN;

  if (!appToken || token !== appToken) {
    return NextResponse.json({ error: "Token yanlış" }, { status: 401 });
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
