"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { loadPlayerDetail, setPlayerBalance, removePlayerNft, type AdminPlayerDetail } from "@/lib/api-client"

function fmtTon(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 })
}
function fmtDate(ms: number) {
  if (!ms) return "—"
  const d = new Date(ms)
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

type ActivityKind = "all" | "deposits" | "cases" | "upgrades" | "bets" | "withdrawals"

interface Entry {
  ts: number
  node: React.ReactNode
}

export function PlayerDetailSheet({
  uid,
  adminId,
  onClose,
  onBalanceChange,
}: {
  uid: string
  adminId: string
  onClose: () => void
  onBalanceChange?: (uid: string, ton: number) => void
}) {
  const [data, setData] = useState<AdminPlayerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ActivityKind>("all")

  const [balanceInput, setBalanceInput] = useState("")
  const [savingBalance, setSavingBalance] = useState(false)
  const [balanceMsg, setBalanceMsg] = useState<string | null>(null)
  const [removingUid, setRemovingUid] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    loadPlayerDetail(uid, adminId)
      .then((d) => {
        if (!active) return
        setData(d)
        setBalanceInput(String(d.player.ton))
        setError(null)
      })
      .catch((e) => active && setError(e.message || "Failed to load player"))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [uid, adminId])

  async function saveBalance() {
    const n = Number(balanceInput)
    if (!Number.isFinite(n) || n < 0) {
      setBalanceMsg("Enter a valid amount")
      return
    }
    setSavingBalance(true)
    setBalanceMsg(null)
    try {
      const ton = await setPlayerBalance(uid, n, adminId)
      setData((prev) => (prev ? { ...prev, player: { ...prev.player, ton } } : prev))
      setBalanceInput(String(ton))
      setBalanceMsg("Saved")
      onBalanceChange?.(uid, ton)
    } catch (e: any) {
      setBalanceMsg(e.message || "Failed to save")
    } finally {
      setSavingBalance(false)
    }
  }

  async function removeNft(nftUid: string) {
    if (removingUid) return
    setRemovingUid(nftUid)
    try {
      const nftCount = await removePlayerNft(uid, nftUid, adminId)
      // Optimistically drop the NFT from local state and sync the count.
      setData((prev) =>
        prev
          ? {
              ...prev,
              player: {
                ...prev.player,
                nfts: prev.player.nfts.filter((n) => n.uid !== nftUid),
                nftCount,
              },
            }
          : prev,
      )
    } catch (e: any) {
      console.error("[v0] removeNft failed:", e)
      alert(e.message || "Failed to remove NFT")
    } finally {
      setRemovingUid(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="animate-in slide-in-from-right relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[color:var(--border)] bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--border)] bg-black/70 px-4 py-3 backdrop-blur-md">
          <h2 className="text-base font-extrabold text-foreground">Player Profile</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-foreground hover:border-[color:var(--pepe)]"
          >
            Close
          </button>
        </header>

        <div className="px-4 py-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading profile…</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-[color:var(--crimson)]">{error}</p>
          ) : data ? (
            <ProfileBody
              data={data}
              filter={filter}
              setFilter={setFilter}
              balanceInput={balanceInput}
              setBalanceInput={setBalanceInput}
              saveBalance={saveBalance}
              savingBalance={savingBalance}
              balanceMsg={balanceMsg}
              removeNft={removeNft}
              removingUid={removingUid}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ProfileBody({
  data,
  filter,
  setFilter,
  balanceInput,
  setBalanceInput,
  saveBalance,
  savingBalance,
  balanceMsg,
  removeNft,
  removingUid,
}: {
  data: AdminPlayerDetail
  filter: ActivityKind
  setFilter: (k: ActivityKind) => void
  balanceInput: string
  setBalanceInput: (s: string) => void
  saveBalance: () => void
  savingBalance: boolean
  balanceMsg: string | null
  removeNft: (nftUid: string) => void
  removingUid: string | null
}) {
  const { player, totals, deposits, caseOpens, upgrades, bets, withdrawals } = data

  // Merge all activity into one timeline for the "all" view.
  const timeline: Entry[] = []
  for (const d of deposits) {
    timeline.push({
      ts: d.createdAt,
      node: (
        <ActivityRow
          key={`dep_${d.id}`}
          tag="Deposit"
          tagColor="var(--pepe)"
          title={`+${fmtTon(d.amount)} TON`}
          sub={d.method ? d.method.toUpperCase() : "Deposit"}
          ts={d.createdAt}
        />
      ),
    })
  }
  for (const c of caseOpens) {
    timeline.push({
      ts: c.createdAt,
      node: (
        <ActivityRow
          key={`case_${c.id}`}
          tag="Case"
          tagColor="#7cc4ff"
          title={`${c.nftName || "Item"} · ${fmtTon(c.nftPrice)} TON`}
          sub={`${c.caseName || c.caseId}${c.kind !== "paid" ? ` (${c.kind})` : ` · -${fmtTon(c.cost)} TON`}`}
          ts={c.createdAt}
        />
      ),
    })
  }
  for (const u of upgrades) {
    timeline.push({
      ts: u.createdAt,
      node: (
        <ActivityRow
          key={`upg_${u.id}`}
          tag="Upgrade"
          tagColor={u.win ? "var(--pepe)" : "var(--crimson)"}
          title={u.win ? `✅ ${u.stakeName} → ${u.targetName}` : `❌ ${u.stakeName} (програш)`}
          sub={`Шанс ${u.chance}% · ставка ${fmtTon(u.stakePrice)} TON → ціль ${fmtTon(u.targetPrice)} TON`}
          ts={u.createdAt}
        />
      ),
    })
  }
  for (const b of bets) {
    const win = b.won > 0
    timeline.push({
      ts: b.createdAt,
      node: (
        <ActivityRow
          key={`bet_${b.id}`}
          tag="Rocket"
          tagColor={win ? "var(--pepe)" : "var(--crimson)"}
          title={
            b.cashedAt != null
              ? `Cashed @ ${b.cashedAt.toFixed(2)}x · +${fmtTon(b.won)} TON`
              : `Bust · -${fmtTon(b.amount)} TON`
          }
          sub={`Bet ${fmtTon(b.amount)} TON · round #${b.roundId}`}
          ts={b.createdAt}
        />
      ),
    })
  }
  for (const w of withdrawals) {
    timeline.push({
      ts: w.createdAt,
      node: (
        <ActivityRow
          key={`wd_${w.id}`}
          tag="Withdraw"
          tagColor="#ffd600"
          title={`${w.nftName} · ${fmtTon(w.floorPrice)} TON`}
          sub={w.status === "sent" ? "Sent" : "Pending"}
          ts={w.createdAt}
        />
      ),
    })
  }
  timeline.sort((a, b) => b.ts - a.ts)

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="glass-card flex items-center gap-3 rounded-2xl p-4">
        {player.photoUrl ? (
          <Image
            src={player.photoUrl || "/placeholder.svg"}
            alt={player.username}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--pepe)] text-xl font-black text-black">
            {(player.username || "?")[0].toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-extrabold text-foreground">@{player.username}</span>
            {player.banned && (
              <span className="rounded-md bg-[color:var(--crimson)]/20 px-2 py-0.5 text-[10px] font-bold uppercase text-[color:var(--crimson)]">
                Banned
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            ID {player.id}
            {player.refBy ? ` · ref by ${player.refBy}` : ""}
          </p>
        </div>
      </div>

      {/* Balance editor */}
      <div className="glass-card rounded-2xl p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Edit balance</p>
        <div className="flex items-center gap-2">
          <input
            value={balanceInput}
            onChange={(e) => setBalanceInput(e.target.value)}
            inputMode="decimal"
            className="flex-1 rounded-xl border border-[color:var(--border)] bg-black/40 px-4 py-2.5 font-bold text-foreground outline-none focus:border-[color:var(--pepe)]"
          />
          <button
            onClick={saveBalance}
            disabled={savingBalance}
            className="rounded-xl bg-[color:var(--pepe)] px-4 py-2.5 text-sm font-extrabold text-black disabled:opacity-50"
          >
            {savingBalance ? "Saving…" : "Save"}
          </button>
        </div>
        {balanceMsg && <p className="mt-2 text-xs text-muted-foreground">{balanceMsg}</p>}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Total deposited" value={`${fmtTon(totals.deposited)} TON`} accent />
        <Metric label="Total withdrawn" value={`${fmtTon(totals.withdrawn)} TON`} />
        <Metric label="Total wagered" value={`${fmtTon(totals.wagered)} TON`} />
        <Metric label="Total won" value={`${fmtTon(totals.won)} TON`} />
        <Metric label="Current balance" value={`${fmtTon(player.ton)} TON`} accent />
        <Metric label="Ref earned" value={`${fmtTon(player.refEarned)} TON`} />
      </div>

      {/* Inventory */}
      {player.nfts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Inventory · {player.nftCount} NFT{player.nftCount === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {player.nfts.map((n) => (
              <div key={n.uid} className="glass-card flex flex-col items-center rounded-xl p-2">
                <Image
                  src={n.img || "/placeholder.svg"}
                  alt={n.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-[12px] object-contain"
                />
                <span className="mt-1 w-full truncate text-center text-[10px] text-muted-foreground">{n.name}</span>
                <span className="text-[10px] font-bold text-[color:var(--pepe)]">{fmtTon(n.price)}</span>
                <button
                  onClick={() => removeNft(n.uid)}
                  disabled={removingUid === n.uid}
                  className="mt-1.5 w-full rounded-md border border-[color:var(--crimson)]/50 px-1.5 py-1 text-[10px] font-bold text-[color:var(--crimson)] transition hover:bg-[color:var(--crimson)]/15 disabled:opacity-50"
                >
                  {removingUid === n.uid ? "…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity log */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Activity log</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["deposits", `Deposits (${deposits.length})`],
              ["cases", `Cases (${caseOpens.length})`],
              ["upgrades", `Upgrades (${upgrades.length})`],
              ["bets", `Rocket (${bets.length})`],
              ["withdrawals", `Withdrawals (${withdrawals.length})`],
            ] as [ActivityKind, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === id ? "bg-[color:var(--pepe)] text-black" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filter === "all" &&
            (timeline.length ? timeline.map((e) => e.node) : <Empty />)}

          {filter === "deposits" &&
            (deposits.length ? (
              deposits.map((d) => (
                <ActivityRow
                  key={d.id}
                  tag="Deposit"
                  tagColor="var(--pepe)"
                  title={`+${fmtTon(d.amount)} TON`}
                  sub={d.method ? d.method.toUpperCase() : "Deposit"}
                  ts={d.createdAt}
                />
              ))
            ) : (
              <Empty />
            ))}

          {filter === "cases" &&
            (caseOpens.length ? (
              caseOpens.map((c) => (
                <ActivityRow
                  key={c.id}
                  tag="Case"
                  tagColor="#7cc4ff"
                  title={`${c.nftName || "Item"} · ${fmtTon(c.nftPrice)} TON`}
                  sub={`${c.caseName || c.caseId}${c.kind !== "paid" ? ` (${c.kind})` : ` · -${fmtTon(c.cost)} TON`}`}
                  ts={c.createdAt}
                />
              ))
            ) : (
              <Empty />
            ))}

          {filter === "upgrades" &&
            (upgrades.length ? (
              upgrades.map((u) => (
                <ActivityRow
                  key={u.id}
                  tag="Upgrade"
                  tagColor={u.win ? "var(--pepe)" : "var(--crimson)"}
                  title={u.win ? `✅ ${u.stakeName} → ${u.targetName}` : `❌ ${u.stakeName} (програш)`}
                  sub={`Шанс ${u.chance}% · ${fmtTon(u.stakePrice)} → ${fmtTon(u.targetPrice)} TON`}
                  ts={u.createdAt}
                />
              ))
            ) : (
              <Empty />
            ))}

          {filter === "bets" &&
            (bets.length ? (
              bets.map((b) => {
                const win = b.won > 0
                return (
                  <ActivityRow
                    key={b.id}
                    tag="Rocket"
                    tagColor={win ? "var(--pepe)" : "var(--crimson)"}
                    title={
                      b.cashedAt != null
                        ? `Cashed @ ${b.cashedAt.toFixed(2)}x · +${fmtTon(b.won)} TON`
                        : `Bust · -${fmtTon(b.amount)} TON`
                    }
                    sub={`Bet ${fmtTon(b.amount)} TON · round #${b.roundId}`}
                    ts={b.createdAt}
                  />
                )
              })
            ) : (
              <Empty />
            ))}

          {filter === "withdrawals" &&
            (withdrawals.length ? (
              withdrawals.map((w) => (
                <ActivityRow
                  key={w.id}
                  tag="Withdraw"
                  tagColor="#ffd600"
                  title={`${w.nftName} · ${fmtTon(w.floorPrice)} TON`}
                  sub={w.status === "sent" ? "Sent" : "Pending"}
                  ts={w.createdAt}
                />
              ))
            ) : (
              <Empty />
            ))}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-card rounded-2xl p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-extrabold ${accent ? "text-[color:var(--pepe)]" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  )
}

function ActivityRow({
  tag,
  tagColor,
  title,
  sub,
  ts,
}: {
  tag: string
  tagColor: string
  title: string
  sub: string
  ts: number
}) {
  return (
    <div className="glass-card flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: `${tagColor}22`, color: tagColor }}
          >
            {tag}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(ts)}</span>
    </div>
  )
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
}
