import { NextRequest } from "next/server"
import { getWithdrawFee, saveWithdrawFee } from "@/lib/withdraw-fee-store"
import { requireAdmin, forbidden } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// Public: current NFT withdrawal fee in Telegram Stars.
export async function GET() {
  const fee = await getWithdrawFee()
  return Response.json({ fee })
}

// Admin: update the NFT withdrawal fee.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = requireAdmin(req, body?.initData)
  if (!admin) return forbidden()
  const fee = await saveWithdrawFee(body.fee)
  return Response.json({ fee })
}
