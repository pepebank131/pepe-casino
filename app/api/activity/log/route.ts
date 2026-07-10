import { NextRequest } from "next/server"
import { authPlayer, unauthorized } from "@/lib/api-helpers"
import { logDeposit, logCaseOpen } from "@/lib/activity-store"

export const dynamic = "force-dynamic"

// Records a real deposit or case-opening event for the authenticated player.
// These power the admin player-detail view and the season depositor leaderboard.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()

  const type = body.type

  try {
    if (type === "deposit") {
      const amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return Response.json({ error: "invalid amount" }, { status: 400 })
      }
      await logDeposit({
        userId: String(user.id),
        username: user.username || "Player",
        photo: user.photoUrl || "",
        amount,
        method: body.method === "stars" ? "stars" : body.method === "ton" ? "ton" : body.method === "promo" ? "promo" : "",
      })
      return Response.json({ ok: true })
    }

    if (type === "case_open") {
      await logCaseOpen({
        userId: String(user.id),
        username: user.username || "Player",
        caseId: String(body.caseId || ""),
        caseName: String(body.caseName || ""),
        nftId: String(body.nftId || ""),
        nftName: String(body.nftName || ""),
        nftPrice: Number(body.nftPrice) || 0,
        kind: body.kind === "free" ? "free" : body.kind === "deposit" ? "deposit" : "paid",
        cost: Number(body.cost) || 0,
      })
      return Response.json({ ok: true })
    }

    return Response.json({ error: "unknown type" }, { status: 400 })
  } catch (e) {
    console.error("[v0] activity log error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
