import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getExpectedAuthToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const password = typeof body?.password === "string" ? body.password : "";
    const expectedPassword = process.env.APP_PASSWORD || "";

    if (!expectedPassword) {
      return NextResponse.json({ error: "未配置 APP_PASSWORD。" }, { status: 500 });
    }

    if (!password || password !== expectedPassword) {
      return NextResponse.json({ error: "密码错误。" }, { status: 401 });
    }

    const token = await getExpectedAuthToken();
    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: "登录失败。",
        detail: error instanceof Error ? error.message : "未知错误"
      },
      { status: 500 }
    );
  }
}
