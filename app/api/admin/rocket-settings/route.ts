import { NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { getRocketSettings, saveRocketSettings } from "@/lib/rocket-settings-store"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const settings = await getRocketSettings()
  return Response.json(settings)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = await requireAdmin(req, body.initData)
  if (!admin.ok) return admin.response
  const settings = await saveRocketSettings(body)
  return Response.json(settings)
}
