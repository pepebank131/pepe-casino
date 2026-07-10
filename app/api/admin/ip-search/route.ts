import { NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { query } from "@/lib/db"

export const dynamic = "force-dynamic"

interface PlayerIpRow {
  uid: string
  name: string
  photo: string
  balance: number
  lastIp: string | null
  ipHistory: string[]
}

function rowToPlayer(r: { uid: string; data: any }): PlayerIpRow {
  const d = r.data || {}
  return {
    uid: String(r.uid),
    name: d.nick || d.name || "Player",
    photo: d.photo || "",
    balance: Number(d.balance) || 0,
    lastIp: d.last_ip || null,
    ipHistory: Array.isArray(d.ip_history) ? d.ip_history : [],
  }
}

// GET /api/admin/ip-search?ip=1.2.3.4              -> all players who used this IP
// GET /api/admin/ip-search?mode=duplicates         -> groups of players sharing an IP (multi-account detection)
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin.ok) return admin.response

  const ip = req.nextUrl.searchParams.get("ip")?.trim()
  const mode = req.nextUrl.searchParams.get("mode")

  try {
    if (mode === "duplicates") {
      // Pull every player that has at least one recorded IP, then group
      // client-side — the player base is small enough that this is cheap and
      // avoids a fragile JSONB-array GIN index just for an admin tool.
      const rows = await query<{ uid: string; data: any }>(
        `SELECT uid, data FROM players WHERE data ? 'last_ip'`,
      )
      const players = rows.map(rowToPlayer)

      const byIp = new Map<string, PlayerIpRow[]>()
      for (const p of players) {
        const ips = new Set<string>([...(p.lastIp ? [p.lastIp] : []), ...p.ipHistory])
        for (const candidateIp of ips) {
          if (!candidateIp || candidateIp === "unknown") continue
          if (!byIp.has(candidateIp)) byIp.set(candidateIp, [])
          byIp.get(candidateIp)!.push(p)
        }
      }

      const groups = Array.from(byIp.entries())
        .filter(([, list]) => {
          // de-dupe by uid in case the same player appears twice for this IP
          const uniqueUids = new Set(list.map((p) => p.uid))
          return uniqueUids.size > 1
        })
        .map(([sharedIp, list]) => {
          const uniqueByUid = Array.from(new Map(list.map((p) => [p.uid, p])).values())
          return { ip: sharedIp, players: uniqueByUid }
        })
        .sort((a, b) => b.players.length - a.players.length)

      return Response.json({ groups })
    }

    if (!ip) {
      return Response.json({ error: "missing_ip" }, { status: 400 })
    }

    const rows = await query<{ uid: string; data: any }>(
      `SELECT uid, data FROM players
       WHERE data->>'last_ip' = $1 OR data->'ip_history' ? $1`,
      [ip],
    )
    const players = rows.map(rowToPlayer)
    return Response.json({ ip, players })
  } catch (e) {
    console.error("[v0] ip-search error:", e)
    return Response.json({ error: "server_error" }, { status: 500 })
  }
}
