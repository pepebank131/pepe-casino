import { NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

function botToken() {
  return process.env.BOT_TOKEN || ""
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

function webhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET || ""
}

async function setWebhook(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response

  const token = botToken()
  if (!token) return Response.json({ ok: false, error: "BOT_TOKEN is not configured" }, { status: 500 })
  const secret = webhookSecret()
  if (process.env.NODE_ENV === "production" && !secret) {
    return Response.json({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET is not configured" }, { status: 500 })
  }

  const url = webhookUrl()
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      allowed_updates: ["message", "pre_checkout_query"],
      drop_pending_updates: false,
      ...(secret ? { secret_token: secret } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    console.error("[telegram] setWebhook failed:", data)
    return Response.json({ ok: false, error: data.description || "setWebhook failed", url }, { status: 502 })
  }

  return Response.json({ ok: true, url, result: data.result })
}

export async function GET(req: NextRequest) {
  return setWebhook(req)
}

export async function POST(req: NextRequest) {
  return setWebhook(req)
}
