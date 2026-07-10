import { NextRequest } from "next/server"
import { redeemPromo } from "@/lib/promo-store"
import { resolveUser } from "@/lib/telegram-auth"

export const dynamic = "force-dynamic"

// Player-facing: redeem a promo code. The server validates the code and records
// the redemption (so it can't be claimed twice), then returns the TON reward.
// The client credits its own authoritative balance and syncs it back, matching
// how the rest of the app handles balance.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const initData = req.headers.get("x-telegram-init-data") || body.initData
  const user = resolveUser(initData)
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }
  try {
    const result = await redeemPromo(String(body.code || ""), user.id)
    return Response.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    console.error("[v0] promo redeem error:", e)
    return Response.json({ ok: false, error: "server error" }, { status: 500 })
  }
}
