import { NextRequest } from "next/server"
import { getCasesConfig, saveCasesConfig } from "@/lib/cases-store"
import { requireAdmin, forbidden } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// Public: any client (Mini App) can read the active case configuration.
export async function GET() {
  try {
    const config = await getCasesConfig()
    return Response.json(config, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      }
    })
  } catch (e) {
    console.error("[v0] cases GET error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}

// Admin-only: persist a new case configuration.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = requireAdmin(req, body?.initData)
  if (!admin) return forbidden()

  try {
    const saved = await saveCasesConfig({ cases: body.cases, free: body.free, deposit: body.deposit, referral: body.referral, promo: body.promo })
    return Response.json(saved)
  } catch (e) {
    console.error("[v0] cases POST error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
