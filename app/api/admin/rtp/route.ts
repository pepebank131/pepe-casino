import { NextRequest } from "next/server"
import { getGlobalRtp, saveGlobalRtp } from "@/lib/rtp-store"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const rtp = await getGlobalRtp()
  return Response.json({ rtp })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = await requireAdmin(req, body.initData)
  if (!admin.ok) return admin.response
  const rtp = await saveGlobalRtp(body.rtp)
  return Response.json({ rtp })
}
