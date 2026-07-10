import { Pool } from "pg"

// Singleton pool — reused across hot reloads in dev and across requests in prod.
const globalForPg = globalThis as unknown as { _pgPool?: Pool }

export const pool =
  globalForPg._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 5,
  })

if (process.env.NODE_ENV !== "production") globalForPg._pgPool = pool

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params)
  return res.rows as T[]
}

// The web app shares the EXISTING Telegram-bot database. The bot stores all
// player state in a single table: players(uid BIGINT PRIMARY KEY, data JSONB).
// We must NOT create our own tables — we read/write the same JSONB document so
// balance, NFTs, and free-case timers stay in sync between the bot and the Mini App.

export interface PlayerData {
  name?: string
  nick?: string
  photo?: string
  balance?: number
  nfts?: BotNft[]
  free_daily_last_open?: number | null
  ref_by?: number | string | null
  [key: string]: any
}

// Shape of an NFT as stored by the bot.
export interface BotNft {
  id: string
  uid?: string
  name?: string
  price?: number
  floor?: number
  rarity?: string
  ts?: number
  [key: string]: any
}
