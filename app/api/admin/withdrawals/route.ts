import { NextRequest } from "next/server"
import {
  createWithdrawal,
  getAllWithdrawals,
  getUserWithdrawals,
  markWithdrawalSent,
} from "@/lib/withdrawals-store"
import { query } from "@/lib/db"
import { resolveUser } from "@/lib/telegram-auth"
import { requireAdmin } from "@/lib/admin-auth"
import { consumeWithdrawPayment } from "@/lib/withdraw-payment-store"

export const dynamic = "force-dynamic"

async function getOwnedNft(userId: string, nftUid: string) {
  const rows = await query<{ data: any }>(`SELECT data FROM players WHERE uid = $1 LIMIT 1`, [userId])
  const nfts = Array.isArray(rows[0]?.data?.nfts) ? rows[0].data.nfts : []
  return nfts.find((n: any) => String(n?.uid || "") === nftUid) || null
}

// GET — admin lists all withdrawal requests for the "Withdrawals" tab.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response
  try {
    const withdrawals = await getAllWithdrawals()
    return Response.json({ withdrawals })
  } catch (e) {
    console.error("[v0] withdrawals GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

// POST — two actions:
//  - "create"  : a player requests a withdrawal (after paying 25 Stars).
//  - "markSent": an admin marks a pending request as delivered.
//  - "mine"    : a player lists their own withdrawals (inventory reconcile).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const initData = req.headers.get("x-telegram-init-data") || body.initData
  const user = resolveUser(initData)
  const action = body.action || "create"

  if (action === "markSent") {
    const admin = await requireAdmin(req, body.initData)
    if (!admin.ok) return admin.response
    try {
      const record = await markWithdrawalSent(String(body.id))
      if (!record) return Response.json({ error: "not found" }, { status: 404 })
      return Response.json({ withdrawal: record })
    } catch (e) {
      console.error("[v0] withdrawals markSent error:", e)
      return Response.json({ error: "server error" }, { status: 500 })
    }
  }

  // Player actions require a resolved user.
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

  // Default: create a new withdrawal request.
  try {
    const nftUid = String(body.nftUid || "")
    const owned = await getOwnedNft(String(user.id), nftUid)
    if (!owned) return Response.json({ error: "forbidden" }, { status: 403 })

    const existing = await getUserWithdrawals(String(user.id))
    if (existing.some((w) => w.nftUid === nftUid && w.status === "pending")) {
      return Response.json({ error: "already_pending" }, { status: 409 })
    }
    const paid = await consumeWithdrawPayment(String(user.id), String(owned.id || body.nftId || ""))
    if (!paid) return Response.json({ error: "payment_required" }, { status: 402 })

    const record = await createWithdrawal({
      userId: String(user.id),
      username: user.username,
      nftUid,
      nftId: String(owned.id || body.nftId || ""),
      nftName: String(owned.name || body.nftName || "NFT"),
      nftImg: String(owned.img || body.nftImg || ""),
      floorPrice: Number(owned.price) || Number(body.floorPrice) || 0,
    })
    return Response.json({ withdrawal: record })
  } catch (e) {
    console.error("[v0] withdrawals create error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
