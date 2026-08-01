import { pool, type PlayerData } from "@/lib/db"
import type { TgUser } from "@/lib/telegram-auth"

export class BannedError extends Error {
  constructor() {
    super("banned")
    this.name = "BannedError"
  }
}

/** Throws BannedError if the player is banned. */
export async function assertNotBanned(uid: string): Promise<void> {
  const rows = await pool.query<{ data: PlayerData }>(`SELECT data FROM players WHERE uid = $1 LIMIT 1`, [uid])
  if (rows.rows[0]?.data && (rows.rows[0].data as any).banned) {
    throw new BannedError()
  }
}

export async function assertUserNotBanned(user: TgUser): Promise<void> {
  await assertNotBanned(String(user.id))
}
