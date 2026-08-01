import { NextRequest } from "next/server"
import crypto from "crypto"
import { resolveUser, getBotToken } from "@/lib/telegram-auth"
import { pool } from "@/lib/db"
import { getWithdrawFee } from "@/lib/withdraw-fee-store"
import { assertUserNotBanned, BannedError } from "@/lib/ban"

export const dynamic = "force-dynamic"

const TON_PER_STAR = 0.3 / 50
const MAX_STARS_DEPOSIT = 100_000

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const initData = req.headers.get("x-telegram-init-data") || body.initData
  const user = resolveUser(initData)
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 })

  try {
    await assertUserNotBanned(user)
  } catch (e) {
    if (e instanceof BannedError) return Response.json({ error: "banned" }, { status: 403 })
    throw e
  }

  const token = getBotToken()
  if (!token) return Response.json({ error: "bot token not configured" }, { status: 500 })

  const stars = Math.max(1, Math.floor(Number(body.stars) || 0))
  if (!stars) return Response.json({ error: "invalid amount" }, { status: 400 })

  const title = String(body.title || "Payment").slice(0, 32)
  const description = String(body.description || "Payment").slice(0, 255)
  const isWithdraw = body.kind === "withdraw"

  let payload: string
  if (isWithdraw) {
    const requiredFee = await getWithdrawFee()
    if (stars !== requiredFee) {
      return Response.json({ error: "invalid_fee", required: requiredFee }, { status: 400 })
    }
    const nftUid = String(body.nftUid || "")
    const nftId = String(body.nftId || "")
    if (!nftUid || !nftId) return Response.json({ error: "missing nft" }, { status: 400 })

    const invoiceId = `wd_${user.id}_${crypto.randomBytes(6).toString("hex")}`
    await pool.query(
      `CREATE TABLE IF NOT EXISTS stars_invoice_intents (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL,
         stars INT NOT NULL,
         ton NUMERIC NOT NULL DEFAULT 0,
         kind TEXT NOT NULL DEFAULT 'deposit',
         nft_uid TEXT,
         created_at BIGINT NOT NULL,
         used_at BIGINT
       )`,
    )
    await pool.query(
      `INSERT INTO stars_invoice_intents (id, user_id, stars, ton, kind, nft_uid, created_at)
       VALUES ($1,$2,$3,0,'withdraw',$4,$5)`,
      [invoiceId, user.id, stars, nftUid, Date.now()],
    )

    payload = JSON.stringify({
      type: "nft_withdraw",
      invoiceId,
      uid: String(user.id),
      nft_uid: nftUid,
      nft_id: nftId,
    })
  } else {
    if (stars > MAX_STARS_DEPOSIT) {
      return Response.json({ error: "amount too large" }, { status: 400 })
    }
    const ton = Math.round(stars * TON_PER_STAR * 1000) / 1000
    if (ton <= 0) return Response.json({ error: "invalid amount" }, { status: 400 })

    const invoiceId = `dep_${user.id}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS stars_invoice_intents (
           id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           stars INT NOT NULL,
           ton NUMERIC NOT NULL,
           kind TEXT NOT NULL DEFAULT 'deposit',
           nft_uid TEXT,
           created_at BIGINT NOT NULL,
           used_at BIGINT
         )`,
      )
      await pool.query(
        `INSERT INTO stars_invoice_intents (id, user_id, stars, ton, kind, created_at) VALUES ($1,$2,$3,$4,'deposit',$5)`,
        [invoiceId, user.id, stars, ton, Date.now()],
      )
    } catch (e) {
      console.error("[v0] invoice intent error:", e)
      return Response.json({ error: "server error" }, { status: 500 })
    }

    payload = JSON.stringify({
      type: "deposit",
      invoiceId,
      uid: String(user.id),
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
