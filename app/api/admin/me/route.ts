import { NextRequest } from "next/server"
import { requireAdmin, forbidden, isAdminUser } from "@/lib/admin-auth"
import { authPlayer, unauthorized } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

/** GET /api/admin/me — header auth only */
export async function GET(req: NextRequest) {
  const user = await authPlayer(req)
  if (!user) return unauthorized()
  return Response.json({ admin: isAdminUser(user), id: user.id })
}

/** POST /api/admin/me — verify admin session */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const admin = requireAdmin(req, body.initData)
  if (!admin) return forbidden()
  return Response.json({ admin: true, id: admin.id })
}
