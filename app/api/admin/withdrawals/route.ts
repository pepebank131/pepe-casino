import { NextRequest } from "next/server"
import { getAllWithdrawals, getUserWithdrawals, markWithdrawalSent } from "@/lib/withdrawals-store"
import { requireAdmin, forbidden } from "@/lib/admin-auth"
import { resolveUser } from "@/lib/telegram-auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req)
  if (!admin) return forbidden()
  try {
    const withdrawals = await getAllWithdrawals()
    return Response.json({ withdrawals })
  } catch (e) {
    console.error("[v0] withdrawals GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action || "create"

  if (action === "markSent") {
    const admin = requireAdmin(req, body?.initData)
    if (!admin) return forbidden()
    try {
      const record = await markWithdrawalSent(String(body.id))
      if (!record) return Response.json({ error: "not found" }, { status: 404 })
      return Response.json({ withdrawal: record })
    } catch (e) {
      console.error("[v0] withdrawals markSent error:", e)
      return Response.json({ error: "server error" }, { status: 500 })
    }
  }

  const initData = req.headers.get("x-telegram-init-data") || body.initData
  const user = resolveUser(initData)
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 })

  if (action === "mine") {
    try {
      const withdrawals = await getUserWithdrawals(String(user.id))
      return Response.json({ withdrawals })
    } catch (e) {
      console.error("[v0] withdrawals mine error:", e)
      return Response.json({ error: "server error" }, { status: 500 })
    }
  }

  // Direct create disabled — withdrawals are created only by the Telegram
  // webhook after a verified Stars fee bound to a specific nft_uid.
  return Response.json({ error: "payment_required" }, { status: 402 })
}
