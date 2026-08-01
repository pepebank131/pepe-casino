import { NextRequest } from "next/server"
import { authPlayer, unauthorized } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

// Client-reported economy events are rejected — deposits are credited via the
// Telegram webhook (successful_payment) and case opens are logged server-side.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()

  const type = body.type

  if (type === "deposit") {
    return Response.json({ error: "forbidden" }, { status: 403 })
  }

  if (type === "case_open") {
    return Response.json({ ok: true, ignored: true })
  }

  return Response.json({ error: "unknown type" }, { status: 400 })
}
