import { NextRequest } from "next/server"
import { getPromos, savePromos } from "@/lib/promo-store"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// Admin-only: list all promo codes (includes usage + redeemers).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response
  try {
    const promos = await getPromos()
    return Response.json({ promos })
  } catch (e) {
    console.error("[v0] promos GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

// Admin-only: replace the full promo list (create/edit/delete from the panel).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = await requireAdmin(req, body.initData)
  if (!admin.ok) return admin.response
  try {
    const saved = await savePromos(body.promos)
    return Response.json({ promos: saved })
  } catch (e) {
    console.error("[v0] promos POST error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
