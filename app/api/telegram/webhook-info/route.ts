import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

function adminSecret() {
  return process.env.ADMIN_API_SECRET || process.env.WEBHOOK_SETUP_SECRET || ""
}

export async function GET(req: NextRequest) {
  const secret = adminSecret()
  if (!secret) {
    return Response.json({ ok: false, error: "ADMIN_API_SECRET / WEBHOOK_SETUP_SECRET not configured" }, { status: 503 })
  }
  const provided = req.headers.get("x-admin-secret") || ""
  if (provided !== secret) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 })
  }

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
