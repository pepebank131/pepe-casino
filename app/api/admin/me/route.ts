import { NextRequest } from "next/server"
import { getInitDataFromRequest, isAdminId } from "@/lib/admin-auth"
import { resolveUser } from "@/lib/telegram-auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = resolveUser(getInitDataFromRequest(req, body.initData))
  if (!user || !isAdminId(user.id)) return Response.json({ ok: false, adminId: "" })
  return Response.json({ ok: true, adminId: user.id })
}
