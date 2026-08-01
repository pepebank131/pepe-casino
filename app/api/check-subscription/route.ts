import { NextRequest } from "next/server"
import { resolveUser, getBotToken } from "@/lib/telegram-auth"

export const dynamic = "force-dynamic"

// The required channel. Must be public (so getChatMember works) — use the
// @username form (no leading "@" needed for the Bot API "chat_id" param,
// but we keep it readable here and prefix when calling).
const REQUIRED_CHANNEL = "@pepe_GiftsNFT"

// POST { initData } — checks whether the caller is currently a member of
// REQUIRED_CHANNEL via the Telegram Bot API's getChatMember.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const user = resolveUser(body.initData)
    if (!user) return Response.json({ subscribed: false, error: "unauthorized" }, { status: 401 })

    const token = getBotToken()
    if (!token) {
      // No bot configured (local/dev) — don't block the flow.
      return Response.json({ subscribed: true })
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: REQUIRED_CHANNEL, user_id: Number(user.id) }),
    })
    const data = await res.json()
    if (!data.ok) {
      // If the bot itself isn't an admin of the channel (or channel not found),
      // fail open so a misconfiguration doesn't lock everyone out.
      console.error("[v0] getChatMember failed:", data.description)
      return Response.json({ subscribed: true })
    }

    const status = data.result?.status
    const subscribed = status === "member" || status === "administrator" || status === "creator"
    return Response.json({ subscribed })
  } catch (e) {
    console.error("[v0] check-subscription error:", e)
    // Fail open on transient errors.
    return Response.json({ subscribed: true })
  }
}
