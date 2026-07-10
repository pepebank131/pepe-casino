import { NextRequest } from "next/server"
import { getBets, getMoneyStats } from "@/lib/admin-stats-store"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// GET — real game money flow (rocket bets) + aggregate house stats.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response
  try {
    const [bets, stats] = await Promise.all([getBets(200), getMoneyStats()])
    return Response.json({ bets, stats })
  } catch (e) {
    console.error("[v0] admin money GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
