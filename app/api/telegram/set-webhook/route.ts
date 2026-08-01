import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

function botToken() {
  return process.env.BOT_TOKEN || ""
}

function adminSecret() {
  return process.env.ADMIN_API_SECRET || process.env.WEBHOOK_SETUP_SECRET || ""
}

function requireSetupSecret(req: NextRequest): Response | null {
  const secret = adminSecret()
  if (!secret) {
    return Response.json({ ok: false, error: "ADMIN_API_SECRET / WEBHOOK_SETUP_SECRET not configured" }, { status: 503 })
  }
  const provided = req.headers.get("x-admin-secret") || ""
  if (provided !== secret) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 })
  }
  return null
}

function webhookUrl() {
  const base =
    process.env.TELEGRAM_WEBHOOK_URL ||
    process.env.WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://pepe-casino.vercel.app"
  const clean = base.replace(/\/$/, "")
  return clean.endsWith("/api/telegram/webhook") ? clean : `${clean}/api/telegram/webhook`
}

async function setWebhook() {
  const token = botToken()
  if (!token) return Response.json({ ok: false, error: "BOT_TOKEN is not configured" }, { status: 500 })

  const url = webhookUrl()
  const body: Record<string, unknown> = {
    url,
    allowed_updates: ["message", "pre_checkout_query", "successful_payment"],
    drop_pending_updates: false,
  }
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret) {
    body.secret_token = webhookSecret
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    console.error("[telegram] setWebhook failed:", data)
    return Response.json({ ok: false, error: data.description || "setWebhook failed", url }, { status: 502 })
  }

  return Response.json({ ok: true, url, result: data.result })
}

export async function GET(req: NextRequest) {
  const denied = requireSetupSecret(req)
  if (denied) return denied
  return setWebhook()
}

export async function POST(req: NextRequest) {
  const denied = requireSetupSecret(req)
  if (denied) return denied
  return setWebhook()
}
