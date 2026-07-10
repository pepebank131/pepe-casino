import { type NextRequest, NextResponse } from "next/server"
import { resolveUser } from "@/lib/telegram-auth"
import { placeRocketBet } from "@/lib/rocket-store"
import { getOrCreatePlayer, getClientIp } from "@/lib/api-helpers"
import { getRocketSettings } from "@/lib/rocket-settings-store"

export const dynamic = "force-dynamic"

// POST /api/rocket/bet — place a bet on the current WAITING round.
// Body: { initData, amount }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const user = resolveUser(body.initData)
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }

    // Enforce admin-configured bet limits
    const { minBet, maxBet } = await getRocketSettings()
    if (amount < minBet) {
      return NextResponse.json({ error: "below_min_bet", min: minBet }, { status: 400 })
    }
    if (amount > maxBet) {
      return NextResponse.json({ error: "above_max_bet", max: maxBet }, { status: 400 })
    }

    const player = await getOrCreatePlayer(user, undefined, getClientIp(req))
    const playerData = player.data || {}
    const res = await placeRocketBet({
      userId: user.id,
      username: playerData.nick || playerData.name || user.username,
      photo: user.photoUrl || playerData.photo || "",
      amount: Math.round(amount * 1000) / 1000,
    })
    if (!res.ok) {
      const status = res.error === "round_in_progress" ? 409 : 400
      return NextResponse.json({ error: res.error }, { status })
    }
    return NextResponse.json(res.state, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[v0] /api/rocket/bet error:", e)
    return NextResponse.json({ error: "bet_failed" }, { status: 500 })
  }
}
