import { NextRequest } from "next/server"
import { requireAdmin, forbidden } from "@/lib/admin-auth"
import { getRocketSettings, saveRocketSettings } from "@/lib/rocket-settings-store"

export const dynamic = "force-dynamic"

// Public: rocket game settings for clients
export async function GET() {
  const settings = await getRocketSettings()
  return Response.json(settings)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = requireAdmin(req, body?.initData)
  if (!admin) return forbidden()
  const settings = await saveRocketSettings(body)
  return Response.json(settings)
}
