import crypto from "crypto"

export interface TgUser {
  id: string
  username: string
  photoUrl?: string
}

/**
 * Verifies Telegram WebApp initData using the bot token, per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Returns the authenticated user, or null if invalid / not configured.
 */
/** The bot token is stored in BOT_TOKEN (with TELEGRAM_BOT_TOKEN as a fallback). */
export function getBotToken(): string | undefined {
  return process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
}

export function verifyInitData(initData: string): TgUser | null {
  const botToken = getBotToken()
  if (!initData || !botToken) return null

  const params = new URLSearchParams(initData)
  const hash = params.get("hash")
  if (!hash) return null
  params.delete("hash")

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n")

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest()
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")
  if (computed !== hash) return null

  // Optional freshness check (24h)
  const authDate = Number(params.get("auth_date") || 0)
  if (authDate && Date.now() / 1000 - authDate > 86400) return null

  try {
    const user = JSON.parse(params.get("user") || "{}")
    if (!user.id) return null
    return {
      id: String(user.id),
      username: user.username || user.first_name || "Player",
      photoUrl: user.photo_url,
    }
  } catch {
    return null
  }
}

/**
 * Resolves the acting user for an API request.
 * - In production with a bot token, requires valid signed initData.
 * - Outside production without a bot token, falls back to the unsigned user
 *   payload so local previews remain usable.
 */
export function resolveUser(initData: string | null | undefined): TgUser | null {
  if (!initData) return null
  const verified = verifyInitData(initData)
  if (verified) return verified

  if (process.env.NODE_ENV !== "production" && !getBotToken()) {
    try {
      const params = new URLSearchParams(initData)
      const user = JSON.parse(params.get("user") || "{}")
      if (user.id) {
        return {
          id: String(user.id),
          username: user.username || user.first_name || "Player",
          photoUrl: user.photo_url,
        }
      }
    } catch {
      // fall through
    }
  }
  return null
}
