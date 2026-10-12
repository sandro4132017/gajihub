import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true, redirect: "/login" });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}

