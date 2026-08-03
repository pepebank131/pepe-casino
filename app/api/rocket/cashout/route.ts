import { type NextRequest, NextResponse } from "next/server"
import { resolveUser } from "@/lib/telegram-auth"
import { cashoutRocketBet } from "@/lib/rocket-store"
import { assertUserNotBanned, BannedError } from "@/lib/ban"

export const dynamic = "force-dynamic"

// POST /api/rocket/cashout — cash out the caller's active bet while FLYING.
// The winning multiplier is computed from authoritative server time.
// Body: { initData }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const user = resolveUser(body.initData || req.headers.get("x-telegram-init-data"))
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    try {
      await assertUserNotBanned(user)
    } catch (e) {
      if (e instanceof BannedError) return NextResponse.json({ error: "banned" }, { status: 403 })
      throw e
    }

    const res = await cashoutRocketBet(user.id)
    if (!res.ok) {
      const status = res.error === "no_active_bet" ? 404 : 409
      return NextResponse.json({ error: res.error }, { status })
    }
    return NextResponse.json(
      { multiplier: res.multiplier, won: res.won, nft: res.nft, state: res.state, ton: res.ton },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("[v0] /api/rocket/cashout error:", e)
    return NextResponse.json({ error: "cashout_failed" }, { status: 500 })
  }
}
