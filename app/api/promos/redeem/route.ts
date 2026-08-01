import { NextRequest } from "next/server"
import { redeemPromo } from "@/lib/promo-store"
import { resolveUser } from "@/lib/telegram-auth"
import { creditBalance, issuePromoCaseToken, setPendingDepositBonus } from "@/lib/player-economy"
import { assertUserNotBanned, BannedError } from "@/lib/ban"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const initData = req.headers.get("x-telegram-init-data") || body.initData
  const user = resolveUser(initData)
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }
  try {
    await assertUserNotBanned(user)
  } catch (e) {
    if (e instanceof BannedError) return Response.json({ ok: false, error: "banned" }, { status: 403 })
    throw e
  }
  try {
    const result = await redeemPromo(String(body.code || ""), user.id)
    if (!result.ok) {
      return Response.json(result, { status: 400 })
    }

    if (result.type === "ton" && result.reward && result.reward > 0) {
      await creditBalance(String(user.id), result.reward, {
        username: user.username,
        photo: user.photoUrl,
        method: "promo",
      })
      return Response.json(result)
    }

    if (result.type === "percent" && result.bonusPercent) {
      await setPendingDepositBonus(String(user.id), result.bonusPercent)
      return Response.json(result)
    }

    if (result.type === "case") {
      const promoToken = await issuePromoCaseToken(String(user.id))
      return Response.json({ ...result, promoToken })
    }

    return Response.json(result)
  } catch (e) {
    console.error("[v0] promo redeem error:", e)
    return Response.json({ ok: false, error: "server error" }, { status: 500 })
  }
}
