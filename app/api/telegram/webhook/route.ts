import { NextRequest } from "next/server"
import { query, type PlayerData } from "@/lib/db"
import { creditBalance, createWithdrawalSecure } from "@/lib/player-economy"
import { getAdminIds } from "@/lib/admin-auth"

const TON_PER_STAR = 0.3 / 50

export const dynamic = "force-dynamic"

type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

type SuccessfulPayment = {
  currency: string
  total_amount: number
  invoice_payload: string
  telegram_payment_charge_id?: string
  provider_payment_charge_id?: string
}

type TelegramMessage = {
  message_id: number
  text?: string
  caption?: string
  photo?: { file_id: string; width: number; height: number }[]
  chat: { id: number }
  from?: TelegramUser
  successful_payment?: SuccessfulPayment
}

type TelegramUpdate = {
  message?: TelegramMessage
  pre_checkout_query?: { id: string }
  successful_payment?: SuccessfulPayment
}

function botToken() {
  return process.env.BOT_TOKEN || ""
}

function webAppUrl() {
  const raw =
    process.env.WEBAPP_URL ||
    process.env.NEXT_PUBLIC_WEBAPP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "") ||
    "https://pepe-casino.vercel.app"
  return raw.replace(/\/$/, "")
}

function isAdmin(userId: number): boolean {
  return getAdminIds().includes(String(userId))
}

function normalizeRef(text: string, userId: string): string | null {
  const match = text.match(/^(?:\/start(?:@\w+)?|start)(?:\s+(.+))?$/i)
  const payload = match?.[1]?.trim()
  if (!payload) return null
  const ref = payload.startsWith("ref_") ? payload.slice(4) : payload
  if (!/^\d+$/.test(ref) || ref === userId) return null
  return ref
}

function isStartText(text: string) {
  return /^(?:\/start(?:@\w+)?|start)(?:\s|$)/i.test(text.trim())
}

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = botToken()
  if (!token) throw new Error("BOT_TOKEN is not configured")
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    console.error(`[telegram] ${method} failed:`, data)
    throw new Error(data.description || `${method} failed`)
  }
  return data.result
}

async function getUserPhotoUrl(userId: string): Promise<string> {
  try {
    const photos = await telegramApi("getUserProfilePhotos", { user_id: Number(userId), limit: 1 })
    const sizes = photos?.photos?.[0]
    const best = Array.isArray(sizes) ? sizes[sizes.length - 1] : null
    if (!best?.file_id) return ""
    return `/api/telegram/photo?file_id=${encodeURIComponent(best.file_id)}`
  } catch (e) {
    console.error("[telegram] get user photo failed:", e)
    return ""
  }
}

async function referrerName(refBy: string): Promise<string> {
  const rows = await query<{ data: PlayerData }>(`SELECT data FROM players WHERE uid = $1 LIMIT 1`, [refBy])
  const data = rows[0]?.data || {}
  return String(data.nick || data.name || data.username || refBy).replace(/^@/, "")
}

async function referrerNameFast(refBy: string): Promise<string> {
  return Promise.race([
    referrerName(refBy),
    new Promise<string>((resolve) => setTimeout(() => resolve(refBy), 700)),
  ]).catch(() => refBy)
}

async function ensurePlayersTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS players (
       uid BIGINT PRIMARY KEY,
       data JSONB NOT NULL DEFAULT '{}'::jsonb
     )`,
  )
}

async function ensureAppConfig() {
  await query(
    `CREATE TABLE IF NOT EXISTS app_config (
       key TEXT PRIMARY KEY,
       value JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  )
}

async function getAppConfig(key: string): Promise<any> {
  try {
    await ensureAppConfig()
    const rows = await query<{ value: any }>(`SELECT value FROM app_config WHERE key = $1`, [key])
    return rows[0]?.value ?? null
  } catch {
    return null
  }
}

async function setAppConfig(key: string, value: any) {
  await ensureAppConfig()
  await query(
    `INSERT INTO app_config (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

async function registerPlayer(user: TelegramUser, refBy: string | null) {
  await ensurePlayersTable()
  const uid = String(user.id)
  const username = user.username || user.first_name || `user_${uid}`
  const photo = await getUserPhotoUrl(uid)
  const existing = await query<{ uid: string; data: PlayerData }>(`SELECT uid, data FROM players WHERE uid = $1`, [uid])

  if (existing.length) {
    const data = existing[0].data || {}
    const next: PlayerData = {
      ...data,
      username,
      first_name: user.first_name || data.first_name || "",
      name: username || data.name,
      nick: username || data.nick,
      photo: photo || data.photo || "",
      ref_by: data.ref_by ?? refBy,
    }
    await query(`UPDATE players SET data = $2 WHERE uid = $1`, [uid, next])
    return next
  }

  const fresh: PlayerData = {
    username,
    first_name: user.first_name || "",
    name: username,
    nick: username,
    photo,
    balance: 0,
    nfts: [],
    free_daily_last_open: null,
    ref_by: refBy,
    joined_at: Date.now(),
    ref_earned_for: {},
  }
  await query(`INSERT INTO players (uid, data) VALUES ($1, $2) ON CONFLICT (uid) DO NOTHING`, [uid, fresh])
  return fresh
}

const DEFAULT_CAPTION = `HELLO`

async function sendStartMessage(chatId: number, extraText?: string) {
  const buttonText = await getAppConfig("button_text")
  const replyMarkup = {
    inline_keyboard: [[{ text: buttonText ? String(buttonText) : "🎰 PLAY", web_app: { url: webAppUrl() } }]],
  }

  const fwdMsgId = await getAppConfig("start_forward_message_id")
  const fwdChatId = await getAppConfig("start_forward_chat_id")

  if (fwdMsgId && fwdChatId) {
    // copyMessage — без "Переслано від", зберігає анімовані емодзі
    await telegramApi("copyMessage", {
      chat_id: chatId,
      from_chat_id: Number(fwdChatId),
      message_id: Number(fwdMsgId),
      reply_markup: replyMarkup,
    })
    if (extraText) {
      await telegramApi("sendMessage", { chat_id: chatId, text: extraText.trim() })
    }
    return
  }

  // Якщо немає збереженого — звичайне фото
  const photoId = await getAppConfig("start_photo_id")
  const captionVal = await getAppConfig("start_caption")
  const caption = (captionVal ? String(captionVal) : DEFAULT_CAPTION) + (extraText || "")
  const photo = photoId ? String(photoId) : `${webAppUrl()}/pepe-logo.png`
  await telegramApi("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    reply_markup: replyMarkup,
  })
}

async function handleAdminCommand(message: TelegramMessage) {
  const from = message.from!
  const chatId = message.chat.id

  if (!isAdmin(from.id)) return

  const text = message.text || message.caption || ""

  // /setphoto — фото з підписом /setphoto
  if (message.photo && /^\/setphoto/i.test(text.trim())) {
    const fileId = message.photo[message.photo.length - 1].file_id
    await setAppConfig("start_photo_id", fileId)
    // Скидаємо forward щоб використовувалось фото
    await setAppConfig("start_forward_message_id", null)
    await setAppConfig("start_forward_chat_id", null)
    await telegramApi("sendMessage", { chat_id: chatId, text: "✅ Фото збережено!" })
    return
  }

  // /setstart — адмін запускає режим збереження
  if (/^\/setstart/i.test(text.trim())) {
    await setAppConfig("awaiting_start_media", String(chatId))
    await telegramApi("sendMessage", { chat_id: chatId, text: "📸 Тепер надішли фото з підписом — це стане стартовим повідомленням" })
    return
  }

  // /settext Ваш текст
  const textMatch = text.match(/^\/settext\s+([\s\S]+)/i)
  if (textMatch) {
    await setAppConfig("start_caption", textMatch[1].trim())
    // Скидаємо forward
    await setAppConfig("start_forward_message_id", null)
    await setAppConfig("start_forward_chat_id", null)
    await telegramApi("sendMessage", { chat_id: chatId, text: "✅ Текст збережено!" })
    return
  }

  // /setreset
  // /setbutton Текст — змінити текст кнопки PLAY
  if (/^\/setbutton/i.test(text.trim())) {
    const match = text.match(/^\/setbutton\s+([\s\S]+)/i)
    if (match) {
      await setAppConfig("button_text", match[1].trim())
      await telegramApi("sendMessage", { chat_id: chatId, text: `✅ Кнопка змінена: ${match[1].trim()}` })
    } else {
      await setAppConfig("button_text", null)
      await telegramApi("sendMessage", { chat_id: chatId, text: "✅ Кнопка скинута до 🎰 PLAY" })
    }
    return
  }

  if (/^\/setreset/i.test(text.trim())) {
    await setAppConfig("start_photo_id", null)
    await setAppConfig("start_caption", null)
    await setAppConfig("start_forward_message_id", null)
    await setAppConfig("start_forward_chat_id", null)
    await telegramApi("sendMessage", { chat_id: chatId, text: "✅ Скинуто до дефолту!" })
    return
  }

  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "📋 Команди адміна:\n/setphoto — надішли фото з цим підписом\n/setsticker — надішли стікер/гіфку з цим підписом\n/settext Текст — змінити текст\n/setreset — скинути на дефолт",
  })
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  // In production the webhook MUST be locked; without a secret anyone can forge payments.
  if (!expectedSecret && process.env.NODE_ENV === "production") {
    console.error("[telegram] TELEGRAM_WEBHOOK_SECRET is not configured")
    return Response.json({ ok: false, error: "misconfigured" }, { status: 503 })
  }
  if (expectedSecret) {
    const provided = req.headers.get("x-telegram-bot-api-secret-token") || ""
    if (provided !== expectedSecret) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 })
    }
  }

  const update = (await req.json().catch(() => ({}))) as TelegramUpdate

  // Validate invoice before Telegram charges the user.
  if (update.pre_checkout_query?.id) {
    try {
      await query(
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
      const pcq = update.pre_checkout_query as any
      const payload = JSON.parse(pcq.invoice_payload || "{}")
      const invoiceId = String(payload?.invoiceId || "")
      const stars = Number(pcq.total_amount) || 0
      if (!invoiceId || stars <= 0) {
        await telegramApi("answerPreCheckoutQuery", {
          pre_checkout_query_id: pcq.id,
          ok: false,
          error_message: "Invalid invoice",
        })
        return Response.json({ ok: true })
      }
      const intents = await query<{ stars: number; used_at: number | null; user_id: string }>(
        `SELECT stars, used_at, user_id FROM stars_invoice_intents WHERE id = $1`,
        [invoiceId],
      ).catch(() => [])
      const fromId = String(pcq.from?.id || "")
      if (
        !intents.length ||
        intents[0].used_at ||
        Number(intents[0].stars) !== stars ||
        String(intents[0].user_id) !== fromId
      ) {
        await telegramApi("answerPreCheckoutQuery", {
          pre_checkout_query_id: pcq.id,
          ok: false,
          error_message: "Invoice expired or invalid",
        })
        return Response.json({ ok: true })
      }
      await telegramApi("answerPreCheckoutQuery", { pre_checkout_query_id: pcq.id, ok: true })
    } catch (e) {
      console.error("[telegram] pre_checkout error:", e)
      try {
        await telegramApi("answerPreCheckoutQuery", {
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: false,
          error_message: "Payment unavailable",
        })
      } catch {}
    }
    return Response.json({ ok: true })
  }

  const message = update.message
  const payment = message?.successful_payment || update.successful_payment
  if (payment?.invoice_payload) {
    try {
      const payload = JSON.parse(payment.invoice_payload)
      const payerId = String(message?.from?.id || "")
      const starsPaid = Number(payment.total_amount) || 0
      const chargeId = String(payment.telegram_payment_charge_id || payment.provider_payment_charge_id || "")
      const username = message?.from?.username || message?.from?.first_name || "Player"
      const invoiceId = String(payload?.invoiceId || "")

      await query(
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
      await query(
        `CREATE TABLE IF NOT EXISTS stars_deposit_credits (
           charge_id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           amount NUMERIC NOT NULL,
           created_at BIGINT NOT NULL
         )`,
      )

      // Require server-issued invoice intent for every payment.
      if (!invoiceId) return Response.json({ ok: true })
      // Atomically claim the invoice intent (prevents double credit).
      const claimed = await query<{
        stars: number
        user_id: string
        kind: string
        nft_uid: string | null
      }>(
        `UPDATE stars_invoice_intents SET used_at = $2
         WHERE id = $1 AND used_at IS NULL AND user_id = $3 AND stars = $4
         RETURNING stars, user_id, kind, nft_uid`,
        [invoiceId, Date.now(), payerId, starsPaid],
      )
      if (!claimed.length) return Response.json({ ok: true })
      const intent = claimed[0]

      if (chargeId) {
        const dup = await query(`SELECT 1 FROM stars_deposit_credits WHERE charge_id = $1`, [chargeId])
        if (dup.length) return Response.json({ ok: true })
      }

      if (payload?.type === "nft_withdraw" || intent.kind === "withdraw") {
        const nftUid = String(intent.nft_uid || "")
        if (!nftUid) return Response.json({ ok: true })
        if (chargeId) {
          await query(`INSERT INTO stars_deposit_credits (charge_id, user_id, amount, created_at) VALUES ($1,$2,$3,$4)`, [
            chargeId,
            payerId,
            0,
            Date.now(),
          ]).catch(() => {})
        }
        await createWithdrawalSecure({ userId: payerId, username, nftUid }).catch((e) =>
          console.error("[telegram] withdraw create failed:", e),
        )
        return Response.json({ ok: true })
      }

      // Deposit: credit from Stars paid (+ pending % promo bonus on server).
      const baseTon = Math.round(starsPaid * TON_PER_STAR * 1000) / 1000
      if (baseTon <= 0) return Response.json({ ok: true })
      if (chargeId) {
        await query(`INSERT INTO stars_deposit_credits (charge_id, user_id, amount, created_at) VALUES ($1,$2,$3,$4)`, [
          chargeId,
          payerId,
          baseTon,
          Date.now(),
        ])
      }
      await creditBalance(payerId, baseTon, { username, method: "stars", applyDepositBonus: true })
    } catch (e) {
      console.error("[telegram] successful_payment handling failed:", e)
    }
    return Response.json({ ok: true })
  }

  const from = message?.from
  if (!message || !from) {
    return Response.json({ ok: true })
  }

  const text = message.text || message.caption || ""

  try {
    // Якщо адмін надсилає повідомлення після /setstart — зберігаємо для пересилання
    const chatId = message.chat.id
    if (isAdmin(from.id)) {
      const awaitingChatId = await getAppConfig("awaiting_start_media")
      if (awaitingChatId && String(awaitingChatId) === String(chatId)) {
        await setAppConfig("start_forward_message_id", message.message_id)
        await setAppConfig("start_forward_chat_id", chatId)
        await setAppConfig("awaiting_start_media", null)
        await telegramApi("sendMessage", { chat_id: chatId, text: "✅ Збережено! На /start тепер буде пересилатись це повідомлення" })
        return Response.json({ ok: true })
      }
    }

    // Адмін команди
    if (
      /^\/setphoto/i.test(text.trim()) ||
      /^\/setstart/i.test(text.trim()) ||
      /^\/setbutton/i.test(text.trim()) ||
      /^\/settext/i.test(text.trim()) ||
      /^\/setreset/i.test(text.trim()) ||
      (message.photo && /^\/setphoto/i.test((message.caption || "").trim()))
    ) {
      await handleAdminCommand(message)
      return Response.json({ ok: true })
    }
    // /admin — приватна кнопка в адмінку, працює тільки для адмінів
    if (/^\/admin(?:@\w+)?\s*$/i.test(text.trim())) {
      if (!isAdmin(from.id)) {
        return Response.json({ ok: true })
      }
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "🔐 Admin panel",
        reply_markup: {
          inline_keyboard: [[{ text: "⚙️ Open Admin Panel", web_app: { url: `${webAppUrl()}/admin` } }]],
        },
      })
      return Response.json({ ok: true })
    }

    // /start
    if (isStartText(text)) {
    // /start
    if (isStartText(text)) {
      // Check ban
      try {
        const banRows = await query<{ data: any }>(`SELECT data FROM players WHERE uid = $1`, [String(from.id)])
        if (banRows[0]?.data?.banned) {
          await telegramApi("sendMessage", {
            chat_id: message.chat.id,
            text: "🚫 Your account has been blocked.\n\nPlease contact support.",
            reply_markup: { inline_keyboard: [[{ text: "💬 Contact Support", url: "https://t.me/Pepe_bot_support" }]] },
          })
          return Response.json({ ok: true })
        }
      } catch {}
      const refBy = normalizeRef(text, String(from.id))
      const invitedBy = refBy ? await referrerNameFast(refBy) : null
      const inviteLine = invitedBy ? `\n\n👥 Вас пригласил @${invitedBy}!` : ""
      await sendStartMessage(message.chat.id, inviteLine)
      registerPlayer(from, refBy).catch((err) => console.error("[telegram] register player failed:", err))
      return Response.json({ ok: true })
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error("[telegram] webhook error:", e)
    return Response.json({ ok: false }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ ok: true, route: "telegram webhook" })
}
