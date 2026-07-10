"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { TonIcon, ChevronLeftIcon, TrophyIcon } from "@/components/icons"
import { useStore } from "@/lib/store"
import { loadLeaderboard, type LeaderboardEntry } from "@/lib/api-client"
import { nftById } from "@/lib/casino-data"

interface PrizeInfo {
  rank: number
  nftId: string
  name: string
}

const PLACE_COLORS: Record<number, string> = { 1: "#ffd600", 2: "#c9d4e0", 3: "#cd7f32" }

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0d 0h 0m"
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (d > 0) return `${d}d ${h}h ${m}m`
  return `${h}h ${m}m ${s}s`
}

function fmtTon(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function LeaderboardSheet({ onClose }: { onClose: () => void }) {
  const { tgId } = useStore()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [prizes, setPrizes] = useState<PrizeInfo[]>([])
  const [seasonIndex, setSeasonIndex] = useState(1)
  const [endMs, setEndMs] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadLeaderboard()
      .then((data) => {
        if (!active) return
        setEntries(data.entries)
        setPrizes(data.prizes)
        setSeasonIndex(data.season.index)
        setEndMs(data.season.endMs)
        setError(null)
      })
      .catch((e) => active && setError(e.message || "Failed to load leaderboard"))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (endMs == null) return
    const update = () => setTimeLeft(fmtCountdown(endMs - Date.now()))
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [endMs])

  const prizeFor = (rank: number) => prizes.find((p) => p.rank === rank)
  const podium = entries.slice(0, 3)
  const rest = entries.slice(3)
  const order = [1, 0, 2] // visual order: 2nd, 1st, 3rd

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="animate-in slide-in-from-bottom relative z-10 flex max-h-[92vh] w-full max-w-[480px] flex-col rounded-t-3xl px-4 pb-8 pt-4"
        style={{
          background: "linear-gradient(180deg,#0b0f12,#06120a)",
          borderTop: "3px solid rgba(255,214,0,0.5)",
          boxShadow: "0 -10px 40px rgba(255,214,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            <ChevronLeftIcon className="h-5 w-5" /> Back
          </button>
          <h2 className="flex items-center gap-1.5 text-base font-extrabold">
            <TrophyIcon className="h-5 w-5 text-gold" /> Season {seasonIndex}
          </h2>
          <span className="w-12" />
        </div>

        {/* One continuous scroll region: countdown, prizes, podium, and the
            full player list all scroll together instead of a tiny inner box. */}
        <div className="no-scrollbar -mx-4 flex-1 overflow-y-auto px-4">
        <div className="mb-4 rounded-xl bg-black/40 py-2 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top depositors - ends in </span>
          <span className="text-sm font-bold text-gold tabular-nums">{timeLeft}</span>
        </div>

        {/* Prize banner */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((rank) => {
            const prize = prizeFor(rank)
            const nft = prize ? nftById(prize.nftId) : null
            const color = PLACE_COLORS[rank]
            return (
              <div
                key={rank}
                className="flex flex-col items-center rounded-xl px-1 py-2"
                style={{ background: `${color}12`, border: `1px solid ${color}40` }}
              >
                <span className="text-[10px] font-black" style={{ color }}>
                  {rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd"}
                </span>
                {nft && (
                  <Image
                    src={nft.img || "/placeholder.svg"}
                    alt={nft.name}
                    width={40}
                    height={40}
                    className="my-1 h-10 w-10 object-contain"
                    style={{ filter: `drop-shadow(0 2px 8px ${color}88)` }}
                  />
                )}
                <span className="w-full truncate text-center text-[9px] font-bold text-foreground">
                  {prize?.name ?? "-"}
                </span>
              </div>
            )
          })}
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading leaderboard...</p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-[color:var(--crimson)]">{error}</p>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No ranked players yet. Climb the board to win prizes!
          </p>
        ) : (
          <>
            {/* podium */}
            <div className="mb-5 mt-2 flex items-end justify-center gap-3 px-1">
              {order.map((idx) => {
                const p = podium[idx]
                if (!p) return null
                const place = idx + 1
                const isFirst = place === 1
                const color = PLACE_COLORS[place]
                const blockH = { 1: 104, 2: 78, 3: 62 } as Record<number, number>
                const avatarSize = isFirst ? 84 : 64
                return (
                  <div key={idx} className="flex w-1/3 flex-col items-center">
                    {/* medal */}
                    <Medal place={place} />
                    {/* avatar */}
                    <div className={isFirst ? "-mt-1" : "mt-1"}>
                      <Avatar entry={p} size={avatarSize} ring={color} glow={isFirst} />
                    </div>
                    {/* name */}
                    <span className="mt-2 max-w-full truncate text-center text-[13px] font-bold text-foreground">
                      {p.username}
                    </span>
                    {/* amount */}
                    <span className="mb-2 mt-0.5 flex items-center gap-1 text-sm font-extrabold text-pepe-light">
                      <TonIcon className="h-3.5 w-3.5" />
                      {fmtTon(p.total)}
                    </span>
                    {/* pedestal */}
                    <div
                      className="flex w-full items-center justify-center rounded-t-2xl text-xl font-black"
                      style={{
                        height: blockH[place],
                        background:
                          place === 1
                            ? "linear-gradient(180deg, rgba(255,214,0,0.22), rgba(255,214,0,0.04))"
                            : "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.01))",
                        border: `1px solid ${color}44`,
                        borderBottom: "none",
                        color,
                      }}
                    >
                      #{place}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* rest list */}
            <div className="space-y-2 pb-2">
              {rest.map((p, i) => {
                const isMe = p.userId === tgId
                return (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{
                      background: isMe ? "rgba(0,255,65,0.1)" : "rgba(255,255,255,0.03)",
                      border: isMe ? "1px solid rgba(0,255,65,0.4)" : "1px solid rgba(0,255,65,0.08)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center text-sm font-bold text-muted-foreground">{i + 4}</span>
                      <Avatar entry={p} size={36} />
                      <span className="max-w-[140px] truncate text-sm font-semibold">{p.username}</span>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-bold tabular-nums text-pepe-light">
                      <TonIcon className="h-3.5 w-3.5" />
                      {fmtTon(p.total)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  )
}

function Medal({ place }: { place: number }) {
  const color = PLACE_COLORS[place]
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-black text-black"
      style={{
        background: `radial-gradient(circle at 35% 30%, ${color}, ${color}aa)`,
        boxShadow: `0 2px 10px ${color}88, inset 0 1px 2px rgba(255,255,255,0.5)`,
        border: `1px solid ${color}`,
      }}
    >
      {place}
    </div>
  )
}

function Avatar({
  entry,
  size,
  ring,
  glow,
}: {
  entry: LeaderboardEntry
  size: number
  ring?: string
  glow?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const ringStyle = ring
    ? { border: `3px solid ${ring}`, boxShadow: glow ? `0 0 22px ${ring}` : `0 0 12px ${ring}88` }
    : { border: "2px solid rgba(255,255,255,0.12)" }

  if (entry.photo && !failed) {
    return (
      // Native <img> (not next/image): Telegram CDN photos aren't whitelisted
      // for the optimizer, and we need an onError fallback to the initial.
      <img
        src={entry.photo || "/placeholder.svg"}
        alt={entry.username}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="rounded-full object-cover"
        style={{ width: size, height: size, ...ringStyle }}
      />
    )
  }
  const hue = Math.abs(hashCode(entry.userId)) % 360
  return (
    <span
      className="flex items-center justify-center rounded-full font-black text-black"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `hsl(${hue} 70% 55%)`,
        ...ringStyle,
      }}
    >
      {initialFor(entry.username)}
    </span>
  )
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h
}

function initialFor(name: string): string {
  const trimmed = (name || "?").trim()
  return trimmed[0]?.toUpperCase() || "?"
}
