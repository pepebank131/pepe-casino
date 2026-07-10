import { NextRequest } from "next/server"
import { resolveUser, getBotToken } from "@/lib/telegram-auth"

export const dynamic = "force-dynamic"

const TON_PER_STAR = 0.006
const MAX_STARS_PAYMENT = 100_000

// Creates a Telegram Stars invoice link via the Bot API (createInvoiceLink).
// Stars invoices use the "XTR" currency and an empty provider_token.
// https://core.telegram.org/bots/api#createinvoicelink
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const initData = req.headers.get("x-telegram-init-data") || body.initData
  const user = resolveUser(initData)
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 })

  const token = getBotToken()
  if (!token) return Response.json({ error: "bot token not configured" }, { status: 500 })

  const stars = Math.floor(Number(body.stars) || 0)
  if (!Number.isFinite(stars) || stars < 1 || stars > MAX_STARS_PAYMENT) {
    return Response.json({ error: "invalid amount" }, { status: 400 })
  }

  const title = String(body.title || "Payment").slice(0, 32)
  const description = String(body.description || "Payment").slice(0, 255)
  const isWithdraw = body.kind === "withdraw"

  // The payload is echoed back in successful_payment; it MUST match the exact
  // shape the Telegram bot's webhook expects so it can credit / process it:
  //   deposit  -> { uid, stars, ton }
  //   withdraw -> { type: "nft_withdraw", uid, nft_id }
  let payload: string
  if (isWithdraw) {
    if (!body.nftId) return Response.json({ error: "missing nftId" }, { status: 400 })
    payload = JSON.stringify({
      type: "nft_withdraw",
      uid: Number(user.id),
      nft_id: body.nftId,
    })
  } else {
    const ton = Math.round(stars * TON_PER_STAR * 1000) / 1000
    payload = JSON.stringify({
      type: "stars_deposit",
      uid: Number(user.id),
      stars,
      ton,
    })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        payload,
        // Telegram Stars: provider_token MUST be an empty string and the
        // currency MUST be "XTR". prices[].amount is the number of Stars.
        provider_token: "",
        currency: "XTR",
        prices: [{ label: title, amount: stars }],
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error("[v0] createInvoiceLink failed:", data)
      return Response.json({ error: data.description || "invoice failed" }, { status: 502 })
    }
    return Response.json({ link: data.result })
  } catch (e) {
    console.error("[v0] create-invoice error:", e)
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
