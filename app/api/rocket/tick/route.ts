import { type NextRequest, NextResponse } from "next/server"
import { getRocketState } from "@/lib/rocket-store"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Cron keep-alive. Requires CRON_SECRET (Vercel sets Authorization: Bearer …). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_API_SECRET
  if (secret) {
    const auth = req.headers.get("authorization") || ""
    const header = req.headers.get("x-cron-secret") || ""
    if (auth !== `Bearer ${secret}` && header !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }

  const deadline = Date.now() + 55_000
  let ticks = 0
  let lastRound = ""
  let rounds = 0
  try {
    while (Date.now() < deadline) {
      const s = await getRocketState()
      ticks++
      if (s.roundId !== lastRound) {
        lastRound = s.roundId
        rounds++
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    return NextResponse.json(
      { ok: true, ticks, rounds },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  } catch (e) {
    console.error("[v0] /api/rocket/tick error:", e)
    return NextResponse.json({ ok: false, ticks, rounds }, { status: 500 })
  }
}
