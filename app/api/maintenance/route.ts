import { NextRequest } from "next/server"
import { getMaintenance, setMaintenance } from "@/lib/maintenance-store"
import { requireAdmin, forbidden } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// Public: any client can read whether maintenance mode is on.
export async function GET() {
  try {
    const on = await getMaintenance()
    return Response.json({ on })
  } catch (e) {
    console.error("[v0] maintenance GET error:", e)
    // Fail open: never lock players out because of a transient DB error.
    return Response.json({ on: false })
  }
}

// Admin-only: toggle maintenance mode.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = requireAdmin(req, body?.initData)
  if (!admin) return forbidden()

  try {
    const on = await setMaintenance(!!body.on)
    return Response.json({ on })
  } catch (e) {
    console.error("[v0] maintenance POST error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
