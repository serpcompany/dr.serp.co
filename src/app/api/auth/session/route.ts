import { NextResponse } from "next/server"

import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, getSessionEmail } from "@/server/auth-session.mjs"

export const runtime = "nodejs"

export async function GET(request: Request) {
  return NextResponse.json(
    { email: getSessionEmail(request) },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })
  return response
}
