import { NextRequest } from "next/server"
import { getGlobalRtp, saveGlobalRtp } from "@/lib/rtp-store"
import { requireAdmin, forbidden } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// Public: current global RTP
export async function GET() {
  const rtp = await getGlobalRtp()
  return Response.json({ rtp })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = requireAdmin(req, body?.initData)
  if (!admin) return forbidden()
  const rtp = await saveGlobalRtp(body.rtp)
  return Response.json({ rtp })
}
