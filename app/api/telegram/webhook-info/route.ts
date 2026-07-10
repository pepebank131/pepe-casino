import { NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response

  const token = process.env.BOT_TOKEN || ""
  if (!token) return Response.json({ ok: false, error: "BOT_TOKEN is not configured" }, { status: 500 })

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { cache: "no-store" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      return Response.json({ ok: false, error: data.description || "getWebhookInfo failed" }, { status: 502 })
    }
    return Response.json({ ok: true, info: data.result })
  } catch (e) {
    console.error("[telegram] getWebhookInfo failed:", e)
    return Response.json({ ok: false, error: "server error" }, { status: 500 })
  }
}
