import { NextRequest } from "next/server"
import { isAdminId } from "@/lib/admin-auth"
import { query, type PlayerData } from "@/lib/db"
import { logDeposit } from "@/lib/activity-store"
import { recordWithdrawPayment } from "@/lib/withdraw-payment-store"

export const dynamic = "force-dynamic"

type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

type TelegramMessage = {
  message_id: number
  text?: string
  caption?: string
  photo?: { file_id: string; width: number; height: number }[]
  successful_payment?: {
    currency: string
    total_amount: number
    invoice_payload: string
  }
  chat: { id: number }
  from?: TelegramUser
}

type TelegramUpdate = {
  message?: TelegramMessage
  pre_checkout_query?: {
    id: string
    from?: TelegramUser
    currency?: string
    total_amount?: number
    invoice_payload?: string
  }
}

function botToken() {
  return process.env.BOT_TOKEN || ""
}

function webhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET || ""
}

function verifyWebhookSecret(req: NextRequest): boolean {
  const secret = webhookSecret()
  if (!secret) return process.env.NODE_ENV !== "production"
  return req.headers.get("x-telegram-bot-api-secret-token") === secret
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
  return isAdminId(userId)
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

async function creditStarsDeposit(user: TelegramUser, payloadRaw: string, paidStars: number, currency: string) {
  if (currency !== "XTR") throw new Error("invalid payment currency")
  const payload = JSON.parse(payloadRaw || "{}")
  if (payload?.type !== "stars_deposit") throw new Error("unsupported payment payload")
  if (String(payload.uid) !== String(user.id)) throw new Error("payment user mismatch")
  if (Number(payload.stars) !== paidStars) throw new Error("payment amount mismatch")

  const ton = Math.round(paidStars * 0.006 * 1000) / 1000
  if (Math.abs(Number(payload.ton) - ton) > 0.0001) throw new Error("payment value mismatch")

  const uid = String(user.id)
  const username = user.username || user.first_name || "Player"
  const rows = await query<{ data: PlayerData }>(`SELECT data FROM players WHERE uid = $1 LIMIT 1`, [uid])
  const prev = rows[0]?.data || {}
  const next: PlayerData = {
    ...prev,
    name: username || prev.name,
    nick: username || prev.nick,
    balance: Math.round(((Number(prev.balance) || 0) + ton) * 1000) / 1000,
    deposited_since_open: Math.round(((Number(prev.deposited_since_open) || 0) + ton) * 1000) / 1000,
  }
  await query(
    `INSERT INTO players (uid, data) VALUES ($1, $2)
     ON CONFLICT (uid) DO UPDATE SET data = $2`,
    [uid, next],
  )
  await logDeposit({
    userId: uid,
    username,
    photo: String(prev.photo || ""),
    amount: ton,
    method: "stars",
  })
}

function validateStarsDepositPayload(user: TelegramUser | undefined, payloadRaw: string | undefined, paidStars: number, currency: string | undefined) {
  if (!user || currency !== "XTR") return false
  try {
    const payload = JSON.parse(payloadRaw || "{}")
    if (payload?.type === "nft_withdraw") {
      return String(payload.uid) === String(user.id) && !!payload.nft_id && paidStars > 0
    }
    const expectedTon = Math.round(paidStars * 0.006 * 1000) / 1000
    return (
      payload?.type === "stars_deposit" &&
      String(payload.uid) === String(user.id) &&
      Number(payload.stars) === paidStars &&
      Math.abs(Number(payload.ton) - expectedTon) <= 0.0001
    )
  } catch {
    return false
  }
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
  if (!verifyWebhookSecret(req)) {
    console.warn("[security] telegram webhook rejected: invalid secret")
    return Response.json({ ok: false }, { status: 403 })
  }

  const update = (await req.json().catch(() => ({}))) as TelegramUpdate
  if (update.pre_checkout_query?.id) {
    const ok = validateStarsDepositPayload(
      update.pre_checkout_query.from,
      update.pre_checkout_query.invoice_payload,
      Number(update.pre_checkout_query.total_amount),
      update.pre_checkout_query.currency,
    )
    await telegramApi("answerPreCheckoutQuery", {
      pre_checkout_query_id: update.pre_checkout_query.id,
      ok,
      ...(ok ? {} : { error_message: "Invalid payment payload" }),
    })
    return Response.json({ ok: true })
  }

  const message = update.message
  const from = message?.from
  if (!message || !from) {
    return Response.json({ ok: true })
  }

  const text = message.text || message.caption || ""

  try {
    if (message.successful_payment) {
      const payload = JSON.parse(message.successful_payment.invoice_payload || "{}")
      if (payload?.type === "stars_deposit") {
        await creditStarsDeposit(
          from,
          message.successful_payment.invoice_payload,
          Number(message.successful_payment.total_amount),
          message.successful_payment.currency,
        )
      } else if (
        payload?.type === "nft_withdraw" &&
        String(payload.uid) === String(from.id) &&
        message.successful_payment.currency === "XTR" &&
        Number(message.successful_payment.total_amount) > 0
      ) {
        await recordWithdrawPayment({
          userId: String(from.id),
          nftId: String(payload.nft_id || ""),
          stars: Number(message.successful_payment.total_amount),
        })
      }
      return Response.json({ ok: true })
    }

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
