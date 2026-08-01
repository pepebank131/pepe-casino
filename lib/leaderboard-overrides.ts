import { query } from "@/lib/db"
import type { DepositorRow } from "@/lib/activity-store"

const CONFIG_KEY = "leaderboard_top_overrides"

export interface LeaderboardOverride {
  rank: 1 | 2 | 3
  enabled: boolean
  username: string
  photo: string
  amount: number
}

const DEFAULT_OVERRIDES: LeaderboardOverride[] = [1, 2, 3].map((rank) => ({
  rank: rank as 1 | 2 | 3,
  enabled: false,
  username: "",
  photo: "",
  amount: 0,
}))

async function ensureConfigTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS app_config (
       key TEXT PRIMARY KEY,
       value JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  )
}

function cleanOverride(input: any, rank: 1 | 2 | 3): LeaderboardOverride {
  const amount = Math.round((Number(input?.amount) || 0) * 1000) / 1000
  return {
    rank,
    enabled: Boolean(input?.enabled) && amount >= 0,
    username: String(input?.username || "").trim().slice(0, 64),
    photo: String(input?.photo || "").trim().slice(0, 512),
    amount,
  }
}

export async function getLeaderboardOverrides(): Promise<LeaderboardOverride[]> {
  await ensureConfigTable()
  const rows = await query<{ value: { overrides?: any[] } }>(`SELECT value FROM app_config WHERE key = $1`, [CONFIG_KEY])
  const saved = Array.isArray(rows[0]?.value?.overrides) ? rows[0].value.overrides : []
  return DEFAULT_OVERRIDES.map((base) => cleanOverride(saved.find((x) => Number(x?.rank) === base.rank), base.rank))
}

export async function saveLeaderboardOverrides(input: any[]): Promise<LeaderboardOverride[]> {
  await ensureConfigTable()
  const overrides = DEFAULT_OVERRIDES.map((base) => cleanOverride(input.find((x) => Number(x?.rank) === base.rank), base.rank))
  await query(
    `INSERT INTO app_config (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [CONFIG_KEY, { overrides }],
  )
  return overrides
}

export async function resetLeaderboardOverrides(): Promise<LeaderboardOverride[]> {
  return saveLeaderboardOverrides(DEFAULT_OVERRIDES)
}

export function applyLeaderboardOverrides(entries: DepositorRow[], overrides: LeaderboardOverride[]): DepositorRow[] {
  const byRank = new Map(overrides.filter((x) => x.enabled).map((x) => [x.rank, x]))
  const used = new Set<string>()
  const result: DepositorRow[] = []
  let autoIndex = 0

  for (const rank of [1, 2, 3] as const) {
    const override = byRank.get(rank)
    if (override) {
      const userId = `manual-leaderboard-${rank}`
      used.add(userId)
      result.push({
        userId,
        username: override.username || `Top ${rank}`,
        photo: override.photo,
        total: override.amount,
      })
      continue
    }

    while (autoIndex < entries.length && used.has(entries[autoIndex].userId)) autoIndex += 1
    if (autoIndex < entries.length) {
      const entry = entries[autoIndex]
      used.add(entry.userId)
      result.push(entry)
      autoIndex += 1
    }
  }

  for (; autoIndex < entries.length; autoIndex += 1) {
    const entry = entries[autoIndex]
    if (used.has(entry.userId)) continue
    used.add(entry.userId)
    result.push(entry)
  }

  return result
}
