import { type NextRequest, NextResponse } from "next/server"
import { resolveUser } from "@/lib/telegram-auth"
import { cashoutRocketBet } from "@/lib/rocket-store"

export const dynamic = "force-dynamic"

// POST /api/rocket/cashout — cash out the caller's active bet while FLYING.
// The winning multiplier is computed from authoritative server time.
// Body: { initData }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const user = resolveUser(body.initData)
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const res = await cashoutRocketBet(user.id)
    if (!res.ok) {
      const status = res.error === "no_active_bet" ? 404 : 409
      return NextResponse.json({ error: res.error }, { status })
    }
    return NextResponse.json(
      { multiplier: res.multiplier, won: res.won, state: res.state },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("[v0] /api/rocket/cashout error:", e)
    return NextResponse.json({ error: "cashout_failed" }, { status: 500 })
  }
}
